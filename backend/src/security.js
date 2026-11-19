import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";
import jwt from "jsonwebtoken";
import winston from "winston";
import { rateLimit } from "express-rate-limit";
import { mkdirSync } from "node:fs";
import { z } from "zod";
import { config, demoEnabled } from "./config.js";
import { query, one } from "./db.js";
mkdirSync("logs", { recursive: true });
export const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: "logs/security.log",
      maxsize: 5_000_000,
      maxFiles: 10,
    }),
  ],
});
export const audit = async (actor, action, target = null, metadata = {}) => {
  await query(
    "INSERT INTO audit_logs(id,actor_id,action,target,metadata) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor || null, action, target, JSON.stringify(metadata)],
  );
  logger.info({ event: action, actor: actor || null, target, metadata });
};
export const digest = (x) => createHash("sha256").update(x).digest("hex");
export const hashPassword = (p) =>
  hash(p, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
export const verifyPassword = (h, p) => verify(h, p);
const encryptionKey = createHash("sha256").update(config.encryption).digest();
export function encrypt(value) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function decrypt(value) {
  if (!value) return null;
  const b = Buffer.from(value, "base64"),
    d = createDecipheriv("aes-256-gcm", encryptionKey, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  verification_status: u.verification_status,
  phone_verified: u.phone_verified,
  verification_note: u.verification_note,
  location: u.location,
});
export const accessToken = (u, family) =>
  jwt.sign({ sub: u.id, sid: family }, config.jwt, {
    algorithm: "HS256",
    expiresIn: "10m",
    issuer: "nearbuy-api",
    audience: "nearbuy-web",
  });
export function decode(token) {
  return jwt.verify(token, config.jwt, {
    algorithms: ["HS256"],
    issuer: "nearbuy-api",
    audience: "nearbuy-web",
  });
}
export async function authenticateToken(token) {
  let claims;
  try {
    claims = decode(token);
  } catch {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  const u = await one(
    "SELECT u.* FROM users u JOIN session_families f ON f.user_id=u.id WHERE u.id=$1 AND f.id=$2 AND f.revoked=false",
    [claims.sub, claims.sid],
  );
  if (!u || u.status !== "active" || (u.is_demo && !demoEnabled))
    throw Object.assign(new Error("Account or session is unavailable"), {
      status: 401,
    });
  return u;
}
export async function auth(req, res, next) {
  try {
    req.user = await authenticateToken(
      req.headers.authorization?.replace(/^Bearer /, ""),
    );
    next();
  } catch (e) {
    next(e);
  }
}
export const optionalAuth = async (req, res, next) =>
  req.headers.authorization ? auth(req, res, next) : next();
export const roles =
  (...allowed) =>
  (req, res, next) =>
    allowed.includes(req.user.role)
      ? next()
      : next(
          Object.assign(
            new Error("You do not have permission for this action"),
            { status: 403 },
          ),
        );
export const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export const text = (min, max) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (s) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s),
      "HTML and control characters are not allowed",
    );
export const id = z.string().uuid();
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success)
    return res.status(400).json({
      error: "Validation failed",
      details: result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  req.body = result.data;
  next();
};
export const limit = (max, windowMs = 900000) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });
export function validateId(req, res, next) {
  if (req.params.id && !id.safeParse(req.params.id).success)
    return res.status(400).json({ error: "Invalid ID" });
  next();
}
