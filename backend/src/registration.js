import { z } from "zod";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { root, production, demoEnabled } from "./config.js";
import { one, query, transaction } from "./db.js";
import {
  audit,
  digest,
  encrypt,
  hashPassword,
  text,
  validate,
  limit,
  fail,
} from "./security.js";
import { districts, identityUpload, identityPhoto } from "./identity.js";
const email = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const phone = z.string().regex(/^\+94[1-9]\d{8}$/);
const challenge = z.string().regex(/^[a-f0-9]{64}$/);
export function installRegistration(router, issue) {
  router.post(
    "/registration-otp",
    limit(6, 3600000),
    validate(z.object({ email, phone }).strict()),
    async (req, res) => {
      const token = randomBytes(32).toString("hex"),
        code = String(randomInt(100000, 1000000));
      await query(
        "DELETE FROM registration_codes WHERE expires_at<now() OR email=$1",
        [req.body.email],
      );
      await query(
        "INSERT INTO registration_codes(id,email,phone_encrypted,phone_hash,code_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          digest(token),
          req.body.email,
          encrypt(req.body.phone),
          digest(req.body.phone),
          digest(code),
          new Date(Date.now() + 600000),
        ],
      );
      if (process.env.SMS_WEBHOOK_URL) {
        const sent = await fetch(process.env.SMS_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.SMS_WEBHOOK_TOKEN,
          },
          body: JSON.stringify({
            to: req.body.phone,
            message:
              "Your NearBuy code is " + code + ". Expires in 10 minutes.",
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!sent.ok) fail(502, "Could not send phone code. Please try again.");
      }
      if (!production)
        await writeFile(
          path.join(root, "registration-phone-outbox.json"),
          JSON.stringify({ challengeId: token, code, expiresInMinutes: 10 }),
          { mode: 0o600 },
        );
      res
        .set("Cache-Control", "no-store")
        .json({
          challengeId: token,
          message: "Phone code sent",
          ...(!production ? { devOtp: code } : {}),
        });
    },
  );
  router.post(
    "/confirm-registration-otp",
    limit(10),
    validate(
      z
        .object({ challengeId: challenge, code: z.string().regex(/^\d{6}$/) })
        .strict(),
    ),
    async (req, res) => {
      const row = await one(
        "UPDATE registration_codes SET attempts=attempts+1 WHERE id=$1 AND attempts<5 AND expires_at>now() AND verified=false RETURNING *",
        [digest(req.body.challengeId)],
      );
      if (!row || row.code_hash !== digest(req.body.code))
        fail(400, "Invalid or expired code (maximum 5 attempts)");
      await query("UPDATE registration_codes SET verified=true WHERE id=$1", [
        row.id,
      ]);
      res
        .set("Cache-Control", "no-store")
        .json({ message: "Mobile number verified" });
    },
  );
  const base = {
    name: text(2, 70),
    email,
    password: z.string().min(12).max(128),
    phone,
  };
  const schema = z.discriminatedUnion("role", [
    z
      .object({ ...base, role: z.literal("buyer"), challengeId: challenge })
      .strict(),
    z
      .object({
        ...base,
        role: z.literal("seller"),
        nic_number: z.string().regex(/^(\d{9}[vVxX]|\d{12})$/),
        product_category: text(2, 70),
        address: text(8, 300),
        district: z.enum(districts),
        seller_terms: z.literal("agree"),
      })
      .strict(),
  ]);
  router.post(
    "/register",
    limit(8),
    identityUpload,
    validate(schema),
    async (req, res) => {
      const b = req.body,
        uid = randomUUID();
      if (await one("SELECT id FROM users WHERE email=$1", [b.email]))
        fail(409, "Email is already registered");
      const nic =
        b.role === "seller"
          ? await identityPhoto(req.files?.nic_photo?.[0])
          : null;
      if (
        b.role === "seller" &&
        b.product_category !== "Other" &&
        !(await one("SELECT id FROM categories WHERE name=$1", [
          b.product_category,
        ]))
      )
        fail(400, "Choose a valid product category");
      const hash = await hashPassword(b.password);
      await transaction(async (tx) => {
        if (b.role === "buyer") {
          const consumed = await tx.query(
            "DELETE FROM registration_codes WHERE id=$1 AND email=$2 AND phone_hash=$3 AND verified=true AND expires_at>now() RETURNING id",
            [digest(b.challengeId), b.email, digest(b.phone)],
          );
          if (!consumed.rows.length)
            fail(400, "Verify this email and mobile number before registering");
        }
        await tx.query(
          "INSERT INTO users(id,name,email,password_hash,role,phone_encrypted,phone_verified,identity_type,identity_encrypted,nic_photo_encrypted,product_category,address_encrypted,location,seller_terms_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
          [
            uid,
            b.name,
            b.email,
            hash,
            b.role,
            encrypt(b.phone),
            b.role === "buyer",
            b.role === "seller" ? "nic" : null,
            b.nic_number ? encrypt(b.nic_number) : null,
            nic,
            b.product_category || null,
            b.address ? encrypt(b.address) : null,
            b.district || null,
            b.role === "seller" ? new Date() : null,
          ],
        );
      });
      await audit(uid, "auth.register", uid);
      res.status(201).json({ message: "Account created. Please sign in." });
    },
  );
  router.post(
    "/mock-oauth",
    limit(10),
    validate(
      z.object({ provider: z.enum(["google", "facebook", "apple"]) }).strict(),
    ),
    async (req, res) => {
      if (!demoEnabled) fail(404, "Mock OAuth is disabled");
      const provider = req.body.provider,
        address = `oauth-${provider}@demo.nearbuy.local`;
      let u = await one("SELECT * FROM users WHERE email=$1", [address]);
      if (!u)
        u = await one(
          "INSERT INTO users(id,name,email,password_hash,role,is_demo) VALUES($1,$2,$3,$4,'buyer',true) ON CONFLICT(email) DO NOTHING RETURNING *",
          [
            randomUUID(),
            `Demo ${provider[0].toUpperCase() + provider.slice(1)} Buyer`,
            address,
            await hashPassword(randomBytes(48).toString("hex")),
          ],
        );
      u ||= await one("SELECT * FROM users WHERE email=$1", [address]);
      if (!u.is_demo || u.role !== "buyer" || u.status !== "active")
        fail(403, "Mock account unavailable");
      await audit(u.id, "auth.mock_oauth", u.id, { provider });
      res.json(await issue(res, u));
    },
  );
}
