import { missingListingDetails } from "./marketplace.js";
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
  decrypt,
} from "./security.js";
import { verificationQueue } from "./verification.js";
export const adminRouter = Router();
adminRouter.use(auth, roles("admin"));
adminRouter.get("/users", async (req, res) =>
  res.json(
    (await rows("SELECT * FROM users ORDER BY created_at DESC LIMIT 500")).map(
      publicUser,
      decrypt,
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
        "UPDATE listings SET status='draft' WHERE seller_id=$1 AND status='approved'",
        [u.id],
      );
    if (updated.role === "seller" && updated.status === "active")
      await query(
        "UPDATE listings SET status='pending_admin' WHERE seller_id=$1 AND status='draft'",
        [u.id],
      );
    await audit(req.user.id, "user.role_status_changed", u.id, req.body);
    res.json(publicUser(updated));
  },
);
adminRouter.get("/verifications", async (req, res) => {
  await audit(req.user.id, "seller.verification_queue_accessed");
  res.set("Cache-Control", "no-store").json(await verificationQueue());
});
adminRouter.get(
  "/verifications/:id/documents/:kind",
  validateId,
  async (req, res) => {
    if (!["nic", "br"].includes(req.params.kind))
      fail(404, "Document not found");
    const u = await one(
      "SELECT nic_photo_encrypted,br_photo_encrypted FROM users WHERE id=$1 AND role='seller'",
      [req.params.id],
    );
    const encrypted =
      req.params.kind === "nic"
        ? u?.nic_photo_encrypted
        : u?.br_photo_encrypted;
    if (!encrypted) fail(404, "Document not found");
    await audit(req.user.id, "seller.identity_document_viewed", req.params.id, {
      kind: req.params.kind,
    });
    res
      .set("Cache-Control", "no-store")
      .json({ image: "data:image/webp;base64," + decrypt(encrypted) });
  },
);
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
      "UPDATE users SET verification_status=$1,verification_note=$2 WHERE id=$3 AND role='seller' AND verification_status='pending' AND phone_verified=true AND ($1='rejected' OR (nic_photo_encrypted IS NOT NULL AND br_photo_encrypted IS NOT NULL AND br_number_encrypted IS NOT NULL AND legal_agreement_at IS NOT NULL)) RETURNING id",
      [req.body.decision, req.body.note, req.params.id],
    );
    if (!u) fail(409, "Seller has no eligible pending request");
    await audit(req.user.id, "seller.verification_" + req.body.decision, u.id);
    req.app.get("io")?.of("/marketplace").emit("seller-verification-changed", {
      sellerId: u.id,
      verification_status: req.body.decision,
    });
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
      "SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM listings WHERE status='approved') AS listings,(SELECT count(*)::int FROM listings WHERE flagged=true AND status!='removed') AS flags,(SELECT count(*)::int FROM audit_logs) AS events",
    ),
  ),
);

adminRouter.get("/listing-approvals", async (req, res) => {
  const listings = await rows(
    "SELECT l.*,u.name AS seller,c.name AS category FROM listings l JOIN users u ON u.id=l.seller_id LEFT JOIN categories c ON c.id=l.category_id WHERE l.status='pending_admin' ORDER BY l.created_at",
  );
  res.json(
    listings.map((p) => ({ ...p, missing_details: missingListingDetails(p) })),
  );
});
adminRouter.patch(
  "/listing-approvals/:id",
  validateId,
  validate(
    z
      .object({ decision: z.enum(["approved", "removed"]), note: text(3, 300) })
      .strict(),
  ),
  async (req, res) => {
    const listing = await one(
      "UPDATE listings SET status=$1,approval_note=$2,updated_at=now() WHERE id=$3 AND status='pending_admin' AND EXISTS(SELECT 1 FROM users WHERE id=listings.seller_id AND status='active' AND role='seller') RETURNING id",
      [req.body.decision, req.body.note, req.params.id],
    );
    if (!listing)
      fail(
        409,
        "Listing is no longer awaiting approval or seller is unavailable",
      );
    await audit(
      req.user.id,
      "listing.approval_" + req.body.decision,
      listing.id,
      { note: req.body.note },
    );
    res.json({ message: "Listing " + req.body.decision });
  },
);
