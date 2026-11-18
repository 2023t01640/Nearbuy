import { Router } from "express";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { root, production } from "./config.js";
import { one, query, rows } from "./db.js";
import {
  auth,
  roles,
  validate,
  text,
  encrypt,
  decrypt,
  digest,
  audit,
  limit,
  fail,
  publicUser,
} from "./security.js";
export const verificationRouter = Router();
verificationRouter.use(auth, roles("seller"));
verificationRouter.get("/", (req, res) => res.json(publicUser(req.user)));
verificationRouter.post(
  "/",
  limit(6, 3600000),
  validate(
    z
      .object({
        identity_type: z.enum(["nic", "business"]),
        identity_number: text(5, 40),
        phone: z.string().regex(/^\+94[1-9]\d{8}$/),
      })
      .strict(),
  ),
  async (req, res) => {
    if (req.user.verification_status === "verified")
      fail(409, "Already verified");
    const b = req.body;
    if (
      b.identity_type === "nic" &&
      !/^(\d{9}[vVxX]|\d{12})$/.test(b.identity_number)
    )
      fail(400, "Enter a valid Sri Lankan NIC format");
    await query(
      "UPDATE users SET identity_type=$1,identity_encrypted=$2,phone_encrypted=$3,phone_verified=false,verification_status='unverified',verification_note=NULL WHERE id=$4",
      [
        b.identity_type,
        encrypt(b.identity_number),
        encrypt(b.phone),
        req.user.id,
      ],
    );
    const code = String(randomInt(100000, 1000000));
    await query(
      "INSERT INTO phone_codes(user_id,code_hash,expires_at,attempts) VALUES($1,$2,$3,0) ON CONFLICT(user_id) DO UPDATE SET code_hash=$2,expires_at=$3,attempts=0",
      [req.user.id, digest(code), new Date(Date.now() + 10 * 60000)],
    );
    if (process.env.SMS_WEBHOOK_URL) {
      const response = await fetch(process.env.SMS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + process.env.SMS_WEBHOOK_TOKEN,
        },
        body: JSON.stringify({
          to: b.phone,
          message: "Your NearBuy code is " + code + ". Expires in 10 minutes.",
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        fail(502, "Could not deliver phone code. Please resubmit.");
    } else if (!production) {
      await writeFile(
        path.join(root, "phone-outbox.json"),
        JSON.stringify({ userId: req.user.id, code, expiresInMinutes: 10 }),
        { mode: 0o600 },
      );
    }
    await audit(req.user.id, "seller.verification_submitted", req.user.id);
    res.json({
      message: production
        ? "Phone code sent"
        : "Phone code created. Local development: see backend/data/phone-outbox.json.",
    });
  },
);
verificationRouter.post(
  "/confirm-phone",
  limit(10),
  validate(z.object({ code: z.string().regex(/^\d{6}$/) }).strict()),
  async (req, res) => {
    const row = await one(
      "UPDATE phone_codes SET attempts=attempts+1 WHERE user_id=$1 AND attempts<5 AND expires_at>now() RETURNING *",
      [req.user.id],
    );
    if (!row || row.code_hash !== digest(req.body.code))
      fail(400, "Invalid or expired code (maximum 5 attempts)");
    const consumed = await one(
      "DELETE FROM phone_codes WHERE user_id=$1 AND code_hash=$2 RETURNING user_id",
      [req.user.id, row.code_hash],
    );
    if (!consumed) fail(400, "Code already used");
    await query(
      "UPDATE users SET phone_verified=true,verification_status='pending' WHERE id=$1",
      [req.user.id],
    );
    await audit(req.user.id, "seller.phone_verified", req.user.id);
    res.json({
      message: "Phone confirmed. Your verification is awaiting admin review.",
    });
  },
);
export async function verificationQueue() {
  return (
    await rows(
      "SELECT id,name,email,identity_type,identity_encrypted,phone_encrypted,phone_verified,verification_status FROM users WHERE role='seller' AND verification_status='pending' ORDER BY created_at",
    )
  ).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    identity_type: u.identity_type,
    identity_number: decrypt(u.identity_encrypted),
    phone: decrypt(u.phone_encrypted),
    phone_verified: u.phone_verified,
    verification_status: u.verification_status,
  }));
}
