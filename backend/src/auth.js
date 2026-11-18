import { Router } from "express";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { one, query } from "./db.js";
import { config } from "./config.js";
import {
  auth,
  audit,
  hashPassword,
  verifyPassword,
  publicUser,
  accessToken,
  digest,
  validate,
  text,
  limit,
  fail,
} from "./security.js";
export const authRouter = Router();
const cookieOptions = {
  httpOnly: true,
  secure: config.secure,
  sameSite: "strict",
  path: "/api/v1/auth",
  maxAge: 7 * 86400000,
};
const email = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const password = z.string().min(12).max(128);
async function issue(res, u, family) {
  if (!family) {
    family = randomUUID();
    await query("INSERT INTO session_families(id,user_id) VALUES($1,$2)", [
      family,
      u.id,
    ]);
  }
  const refresh = randomBytes(48).toString("base64url");
  const inserted = await one(
    "INSERT INTO refresh_tokens(id,user_id,token_hash,family,expires_at) SELECT $1,$2,$3,id,$5 FROM session_families WHERE id=$4 AND revoked=false RETURNING id",
    [
      randomUUID(),
      u.id,
      digest(refresh),
      family,
      new Date(Date.now() + 7 * 86400000),
    ],
  );
  if (!inserted) fail(401, "Session revoked");
  res.cookie("nb_refresh", refresh, cookieOptions);
  return { accessToken: accessToken(u, family), user: publicUser(u) };
}
authRouter.post(
  "/register",
  limit(8),
  validate(
    z
      .object({
        name: text(2, 70),
        email,
        password,
        role: z.enum(["buyer", "seller"]),
      })
      .strict(),
  ),
  async (req, res) => {
    const b = req.body;
    if (await one("SELECT id FROM users WHERE email=$1", [b.email]))
      fail(409, "Email is already registered");
    const uid = randomUUID();
    try {
      await query(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)",
        [uid, b.name, b.email, await hashPassword(b.password), b.role],
      );
    } catch (e) {
      if (e.code === "23505") fail(409, "Email is already registered");
      throw e;
    }
    await audit(uid, "auth.register", uid);
    res.status(201).json({ message: "Account created. Please sign in." });
  },
);
let dummyHash;
authRouter.post(
  "/login",
  limit(10),
  validate(z.object({ email, password: z.string().min(1).max(128) }).strict()),
  async (req, res) => {
    const u = await one("SELECT * FROM users WHERE email=$1", [req.body.email]);
    dummyHash ||= await hashPassword(randomBytes(32).toString("hex"));
    const valid = await verifyPassword(
      u?.password_hash || dummyHash,
      req.body.password,
    );
    if (!u || !valid || u.status !== "active") {
      await audit(null, "auth.login_failed", null, {
        emailHash: digest(req.body.email),
      });
      fail(401, "Invalid email or password");
    }
    await audit(u.id, "auth.login", u.id);
    res.json(await issue(res, u));
  },
);
function csrf(req, res, next) {
  if (
    !config.origins.includes(req.headers.origin) ||
    req.headers["x-nearbuy-csrf"] !== "1"
  )
    return res
      .status(403)
      .json({ error: "Invalid refresh origin or CSRF header" });
  next();
}
authRouter.post("/refresh", limit(60), csrf, async (req, res) => {
  const raw = req.cookies.nb_refresh;
  if (!raw) fail(401, "Sign in required");
  const old = await one("SELECT * FROM refresh_tokens WHERE token_hash=$1", [
    digest(raw),
  ]);
  if (!old) fail(401, "Invalid session");
  if (
    !(await one(
      "SELECT id FROM session_families WHERE id=$1 AND revoked=false",
      [old.family],
    ))
  )
    fail(401, "Session revoked");
  if (old.revoked) {
    await query("UPDATE session_families SET revoked=true WHERE id=$1", [
      old.family,
    ]);
    await query("UPDATE refresh_tokens SET revoked=true WHERE family=$1", [
      old.family,
    ]);
    req.app
      .get("io")
      ?.in("family:" + old.family)
      .disconnectSockets(true);
    await audit(old.user_id, "auth.refresh_reuse", old.family);
    res.clearCookie("nb_refresh", cookieOptions);
    fail(401, "Session revoked. Sign in again");
  }
  const token = await one(
    "UPDATE refresh_tokens SET revoked=true WHERE id=$1 AND revoked=false AND expires_at>now() RETURNING *",
    [old.id],
  );
  if (!token) fail(401, "Session expired");
  const u = await one("SELECT * FROM users WHERE id=$1", [old.user_id]);
  if (!u || u.status !== "active") fail(401, "Account unavailable");
  res.json(await issue(res, u, old.family));
});
authRouter.post("/logout", csrf, async (req, res) => {
  if (req.cookies.nb_refresh) {
    const f = await one(
      "UPDATE session_families SET revoked=true WHERE id IN (SELECT family FROM refresh_tokens WHERE token_hash=$1) RETURNING id",
      [digest(req.cookies.nb_refresh)],
    );
    if (f)
      req.app
        .get("io")
        ?.in("family:" + f.id)
        .disconnectSockets(true);
  }
  res.clearCookie("nb_refresh", cookieOptions);
  res.json({ message: "Signed out" });
});
authRouter.get("/me", auth, (req, res) => res.json(publicUser(req.user)));
