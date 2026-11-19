import { identityUpload, identityPhoto } from "./identity.js";
import { Router } from "express";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { root, production } from "./config.js";
import { one, query, rows, transaction } from "./db.js";
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
verificationRouter.get("/", (req, res) => {
  res.set("Cache-Control", "no-store").json({
    ...publicUser(req.user),
    identity_number: decrypt(req.user.identity_encrypted),
    phone: decrypt(req.user.phone_encrypted),
    has_nic_photo: !!req.user.nic_photo_encrypted,
    br_number: decrypt(req.user.br_number_encrypted),
  });
});
verificationRouter.post(
  "/",
  limit(6, 3600000),
  identityUpload,
  validate(
    z
      .object({
        identity_type: z.literal("nic"),
        identity_number: text(5, 40),
        phone: z.string().regex(/^\+94[1-9]\d{8}$/),
        br_number: text(3, 70),
        legal_agreement: z.literal("agree"),
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
    const nicPhoto = req.files?.nic_photo?.[0]
      ? await identityPhoto(req.files.nic_photo[0])
      : req.user.nic_photo_encrypted;
    if (!nicPhoto) fail(400, "A NIC photo is required");
    const brPhoto = await identityPhoto(req.files?.br_photo?.[0]);
    const code = String(randomInt(100000, 1000000));
    await transaction(async (tx) => {
      const updated = await tx.query(
        "UPDATE users SET nic_photo_encrypted=$1,br_number_encrypted=$2,br_photo_encrypted=$3,legal_agreement_at=now(),identity_type='nic',identity_encrypted=$4,phone_encrypted=$5,phone_verified=false,verification_status='unverified',verification_note=NULL WHERE id=$6 AND verification_status!='verified' RETURNING id",
        [
          nicPhoto,
          encrypt(b.br_number),
          brPhoto,
          encrypt(b.identity_number),
          encrypt(b.phone),
          req.user.id,
        ],
      );
      if (!updated.rows.length) fail(409, "Already verified");
      await tx.query(
        "INSERT INTO phone_codes(user_id,code_hash,expires_at,attempts) VALUES($1,$2,$3,0) ON CONFLICT(user_id) DO UPDATE SET code_hash=$2,expires_at=$3,attempts=0",
        [req.user.id, digest(code), new Date(Date.now() + 10 * 60000)],
      );
    });
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
    }
    if (!production) {
      await writeFile(
        path.join(root, "phone-outbox.json"),
        JSON.stringify({ userId: req.user.id, code, expiresInMinutes: 10 }),
        { mode: 0o600 },
      );
    }
    await audit(req.user.id, "seller.verification_submitted", req.user.id);
    req.app.get("io")?.of("/marketplace").emit("seller-verification-changed", {
      sellerId: req.user.id,
      verification_status: "unverified",
    });
    res.set("Cache-Control", "no-store");
    res.json({
      message: "Phone code sent. Enter it below to confirm your number.",
      ...(!production ? { devOtp: code, expiresInSeconds: 600 } : {}),
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
    req.app.get("io")?.of("/marketplace").emit("seller-verification-changed", {
      sellerId: req.user.id,
      verification_status: "pending",
    });
    res.json({
      message: "Phone confirmed. Your verification is awaiting admin review.",
    });
  },
);
export async function verificationQueue() {
  return (
    await rows(
      "SELECT id,name,email,identity_type,identity_encrypted,phone_encrypted,phone_verified,verification_status,br_number_encrypted,nic_photo_encrypted,br_photo_encrypted,address_encrypted,location,product_category,seller_terms_at,legal_agreement_at FROM users WHERE role='seller' AND verification_status='pending' ORDER BY created_at",
    )
  ).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    identity_type: u.identity_type,
    identity_number: decrypt(u.identity_encrypted),
    phone: decrypt(u.phone_encrypted),
    br_number: decrypt(u.br_number_encrypted),
    has_nic_photo: !!u.nic_photo_encrypted,
    has_br_photo: !!u.br_photo_encrypted,
    address: decrypt(u.address_encrypted),
    district: u.location,
    product_category: u.product_category,
    seller_terms_at: u.seller_terms_at,
    legal_agreement_at: u.legal_agreement_at,
    phone_verified: u.phone_verified,
    verification_status: u.verification_status,
  }));
}
