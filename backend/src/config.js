import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
export const production = process.env.NODE_ENV === "production";
export const root = path.resolve(process.env.DATA_DIR || "data");
mkdirSync(root, { recursive: true });
function secret(name) {
  if (process.env[name]?.length >= 32) return process.env[name];
  if (production)
    throw new Error(name + " must contain at least 32 characters");
  const file = path.join(root, name.toLowerCase() + ".key");
  if (!existsSync(file))
    writeFileSync(file, randomBytes(48).toString("hex"), { mode: 0o600 });
  return readFileSync(file, "utf8").trim();
}
export const config = {
  port: Number(process.env.PORT || 3001),
  jwt: secret("JWT_SECRET"),
  encryption: secret("DATA_ENCRYPTION_KEY"),
  origins: (
    process.env.FRONTEND_ORIGINS ||
    "http://127.0.0.1:5175,http://localhost:5175,http://127.0.0.1:5173"
  ).split(","),
  secure: production || process.env.COOKIE_SECURE === "true",
  uploadDir: path.resolve(process.env.UPLOAD_DIR || "uploads"),
};
if (
  production &&
  (!process.env.DATABASE_URL ||
    !process.env.SMS_WEBHOOK_URL?.startsWith("https://"))
)
  throw new Error(
    "Production requires PostgreSQL DATABASE_URL and an HTTPS SMS_WEBHOOK_URL",
  );
mkdirSync(config.uploadDir, { recursive: true });
