import { Router } from "express";
import { z } from "zod";
import { one, rows, query } from "./db.js";
import {
  auth,
  roles,
  validate,
  text,
  validateId,
  fail,
  audit,
  publicUser,
} from "./security.js";
import { verificationQueue } from "./verification.js";
export const adminRouter = Router();
adminRouter.use(auth, roles("admin"));
adminRouter.get("/users", async (req, res) =>
  res.json(
    (await rows("SELECT * FROM users ORDER BY created_at DESC LIMIT 500")).map(
      publicUser,
    ),
  ),
);
adminRouter.patch(
  "/users/:id",
  validateId,
  validate(
    z
      .object({
        status: z.enum(["active", "suspended"]).optional(),
        role: z.enum(["buyer", "seller", "admin"]).optional(),
      })
      .strict()
      .refine((b) => b.status || b.role),
  ),
  async (req, res) => {
    if (req.params.id === req.user.id)
      fail(409, "You cannot change your own role or status");
    const u = await one("SELECT * FROM users WHERE id=$1", [req.params.id]);
    if (!u) fail(404, "User not found");
    if (u.role === "admin")
      fail(
        403,
        "Use an administrative maintenance procedure to change another admin",
      );
    const updated = await one(
      "UPDATE users SET status=COALESCE($1,status),role=COALESCE($2,role) WHERE id=$3 RETURNING *",
      [req.body.status || null, req.body.role || null, u.id],
    );
    await query("UPDATE session_families SET revoked=true WHERE user_id=$1", [
      u.id,
    ]);
    await query("UPDATE refresh_tokens SET revoked=true WHERE user_id=$1", [
      u.id,
    ]);
    req.app
      .get("io")
      ?.in("user:" + u.id)
      .disconnectSockets(true);
    if (updated.role !== "seller" || updated.status !== "active")
      await query(
        "UPDATE listings SET status='draft' WHERE seller_id=$1 AND status='active'",
        [u.id],
      );
    if (
      updated.role === "seller" &&
      updated.status === "active" &&
      updated.verification_status === "verified"
    )
      await query(
        "UPDATE listings SET status='active' WHERE seller_id=$1 AND status='draft'",
        [u.id],
      );
    await audit(req.user.id, "user.role_status_changed", u.id, req.body);
    res.json(publicUser(updated));
  },
);
adminRouter.get("/verifications", async (req, res) => {
  await audit(req.user.id, "seller.verification_queue_accessed");
  res.json(await verificationQueue());
});
adminRouter.patch(
  "/verifications/:id",
  validateId,
  validate(
    z
      .object({
        decision: z.enum(["verified", "rejected"]),
        note: text(3, 300),
      })
      .strict(),
  ),
  async (req, res) => {
    const u = await one(
      "UPDATE users SET verification_status=$1,verification_note=$2 WHERE id=$3 AND role='seller' AND verification_status='pending' AND phone_verified=true RETURNING id",
      [req.body.decision, req.body.note, req.params.id],
    );
    if (!u) fail(409, "Seller has no eligible pending request");
    if (req.body.decision === "verified")
      await query(
        "UPDATE listings SET status='active',updated_at=now() WHERE seller_id=$1 AND status='draft' AND EXISTS(SELECT 1 FROM users WHERE id=$1 AND status='active')",
        [u.id],
      );
    await audit(req.user.id, "seller.verification_" + req.body.decision, u.id);
    res.json({ message: "Verification " + req.body.decision });
  },
);
adminRouter.get("/flags", async (req, res) =>
  res.json(
    await rows(
      "SELECT l.id,l.title,l.status,l.flag_reason,u.name AS seller FROM listings l JOIN users u ON u.id=l.seller_id WHERE flagged=true AND l.status!='removed' ORDER BY l.created_at DESC",
    ),
  ),
);
adminRouter.patch(
  "/flags/:id",
  validateId,
  validate(z.object({ decision: z.enum(["approve", "remove"]) }).strict()),
  async (req, res) => {
    const p = await one(
      "UPDATE listings SET flagged=false,status=CASE WHEN $1='remove' THEN 'removed' ELSE status END WHERE id=$2 AND flagged=true RETURNING id",
      [req.body.decision, req.params.id],
    );
    if (!p) fail(404, "Flagged listing not found");
    await audit(req.user.id, "listing.flag_" + req.body.decision, p.id);
    res.json({ message: "Moderation saved" });
  },
);
adminRouter.get("/audit", async (req, res) =>
  res.json(
    await rows(
      "SELECT a.id,a.action,a.target,a.metadata,a.created_at AS time,COALESCE(u.name,'Anonymous') AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 500",
    ),
  ),
);
adminRouter.get("/stats", async (req, res) =>
  res.json(
    await one(
      "SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM listings WHERE status='active') AS listings,(SELECT count(*)::int FROM listings WHERE flagged=true AND status!='removed') AS flags,(SELECT count(*)::int FROM audit_logs) AS events",
    ),
  ),
);
