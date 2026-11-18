import { randomUUID, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { root, production } from "../src/config.js";
import { initDb, one, query, closeDb } from "../src/db.js";
import { hashPassword, audit } from "../src/security.js";
if (production)
  throw new Error(
    "Bootstrap is for local development only. Use create-admin.js in production.",
  );
await initDb();
if (await one("SELECT id FROM users WHERE role='admin' LIMIT 1")) {
  console.log("An admin already exists; no account was changed.");
  await closeDb();
} else {
  const id = randomUUID(),
    password = randomBytes(24).toString("base64url"),
    email = "admin@nearbuy.local";
  await query(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'NearBuy Admin',$2,$3,'admin')",
    [id, email, await hashPassword(password)],
  );
  await audit(id, "admin.provisioned", id);
  const file = path.join(root, "local-admin.txt");
  await writeFile(
    file,
    "Local administrator login\nEmail: " +
      email +
      "\nPassword: " +
      password +
      "\n\nLocal development only. This file is ignored by Git.\n",
    { mode: 0o600 },
  );
  console.log(
    "Local admin credentials saved to backend/data/local-admin.txt (not printed).",
  );
  await closeDb();
}
