import { randomUUID } from "node:crypto";
import { initDb, one, query, closeDb } from "../src/db.js";
import { hashPassword, audit } from "../src/security.js";
const {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_NAME = "NearBuy Admin",
} = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12)
  throw new Error(
    "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) before running. No default credentials are created.",
  );
await initDb();
if (
  await one("SELECT id FROM users WHERE email=$1", [ADMIN_EMAIL.toLowerCase()])
)
  throw new Error("This email already exists");
const id = randomUUID();
await query(
  "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin')",
  [
    id,
    ADMIN_NAME,
    ADMIN_EMAIL.toLowerCase(),
    await hashPassword(ADMIN_PASSWORD),
  ],
);
await audit(id, "admin.provisioned", id);
await closeDb();
console.log("Admin account created.");
