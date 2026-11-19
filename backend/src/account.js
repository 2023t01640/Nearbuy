import { placeOrder, validateSelection, selectionSchema } from "./purchases.js";
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { one, rows, query, transaction } from "./db.js";
import {
  auth,
  roles,
  validate,
  validateId,
  text,
  fail,
  encrypt,
  decrypt,
  audit,
  limit,
  hashPassword,
  verifyPassword,
} from "./security.js";
export const accountRouter = Router();
accountRouter.use(["/profile", "/cart", "/orders"], auth);
const profile = (u) => ({
  name: u.name,
  email: u.email,
  phone: decrypt(u.phone_encrypted) || "",
  address: decrypt(u.address_encrypted) || "",
  phone_verified: u.phone_verified,
});
accountRouter.get("/profile", (req, res) =>
  res.set("Cache-Control", "no-store").json(profile(req.user)),
);
accountRouter.patch(
  "/profile",
  roles("buyer"),
  validate(
    z
      .object({
        name: text(2, 70),
        phone: z.string().regex(/^\+94[1-9]\d{8}$/),
        address: text(10, 500),
      })
      .strict(),
  ),
  async (req, res) => {
    const b = req.body,
      changed = decrypt(req.user.phone_encrypted) !== b.phone;
    const u = await one(
      "UPDATE users SET name=$1,phone_encrypted=$2,address_encrypted=$3,phone_verified=CASE WHEN $4 THEN false ELSE phone_verified END WHERE id=$5 RETURNING *",
      [b.name, encrypt(b.phone), encrypt(b.address), changed, req.user.id],
    );
    await audit(req.user.id, "profile.updated", req.user.id);
    res.json(profile(u));
  },
);
accountRouter.post(
  "/profile/password",
  roles("buyer"),
  limit(5),
  validate(
    z
      .object({
        current_password: z.string().min(1).max(128),
        password: z.string().min(12).max(128),
      })
      .strict(),
  ),
  async (req, res) => {
    if (
      !(await verifyPassword(req.user.password_hash, req.body.current_password))
    )
      fail(403, "Current password is incorrect");
    const hash = await hashPassword(req.body.password);
    await transaction(async (tx) => {
      await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        hash,
        req.user.id,
      ]);
      await tx.query(
        "UPDATE session_families SET revoked=true WHERE user_id=$1",
        [req.user.id],
      );
      await tx.query(
        "UPDATE refresh_tokens SET revoked=true WHERE user_id=$1",
        [req.user.id],
      );
    });
    req.app
      .get("io")
      ?.in("user:" + req.user.id)
      .disconnectSockets(true);
    res.clearCookie("nb_refresh", { path: "/api/v1/auth" });
    await audit(req.user.id, "auth.password_changed", req.user.id);
    res.json({ message: "Password updated. Sign in again." });
  },
);
accountRouter.get("/cart", roles("buyer"), async (req, res) =>
  res
    .set("Cache-Control", "no-store")
    .json(
      await rows(
        "SELECT c.listing_id,c.quantity,c.selected_variants,l.stock_quantity,l.variants,l.title,l.price,l.images,l.payment_methods,l.status,u.name AS seller,u.status AS seller_status FROM cart_items c JOIN listings l ON l.id=c.listing_id JOIN users u ON u.id=l.seller_id WHERE c.buyer_id=$1 ORDER BY c.created_at",
        [req.user.id],
      ),
    ),
);
accountRouter.put(
  "/cart/:id",
  roles("buyer"),
  validateId,
  validate(
    z
      .object({
        quantity: z.number().int().min(1).max(99),
        selected_variants: selectionSchema,
      })
      .strict(),
  ),
  async (req, res) => {
    await transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.user.id,
      ]);
      const p = (
        await tx.query(
          "SELECT l.* FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.id=$1 AND l.status='approved' AND u.status='active' AND u.role='seller'",
          [req.params.id],
        )
      ).rows[0];
      if (!p) fail(409, "Listing is unavailable");
      validateSelection(p, req.body.quantity, req.body.selected_variants);
      await tx.query(
        "INSERT INTO cart_items(buyer_id,listing_id,quantity,selected_variants) VALUES($1,$2,$3,$4) ON CONFLICT(buyer_id,listing_id) DO UPDATE SET quantity=$3,selected_variants=$4",
        [
          req.user.id,
          req.params.id,
          req.body.quantity,
          JSON.stringify(req.body.selected_variants),
        ],
      );
    });
    res.json({ message: "Cart updated" });
  },
);
accountRouter.delete(
  "/cart/:id",
  roles("buyer"),
  validateId,
  async (req, res) => {
    await transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.user.id,
      ]);
      await tx.query(
        "DELETE FROM cart_items WHERE buyer_id=$1 AND listing_id=$2",
        [req.user.id, req.params.id],
      );
    });
    res.status(204).end();
  },
);
accountRouter.post(
  "/cart/checkout",
  roles("buyer"),
  limit(15),
  validate(
    z
      .object({
        address: text(10, 500),
        card_simulation: z.boolean().optional(),
        payments: z.record(
          z.uuid(),
          z.enum(["Cash on Delivery", "Online Payment"]),
        ),
      })
      .strict(),
  ),
  async (req, res) => {
    const orders = await transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.user.id,
      ]);
      const items = (
        await tx.query(
          "SELECT l.*,c.quantity,c.selected_variants,u.status AS seller_status,u.role AS seller_role FROM cart_items c JOIN listings l ON l.id=c.listing_id JOIN users u ON u.id=l.seller_id WHERE c.buyer_id=$1 ORDER BY l.id FOR UPDATE OF l",
          [req.user.id],
        )
      ).rows;
      if (!items.length) fail(400, "Your cart is empty");
      const result = [];
      for (const p of items) {
        if (
          p.status !== "approved" ||
          p.seller_status !== "active" ||
          p.seller_role !== "seller" ||
          !p.price
        )
          fail(409, "An item is no longer available. Review your cart.");
        const method = req.body.payments[p.id];
        if (!p.payment_methods.includes(method))
          fail(400, "Choose an enabled payment method for every item");
        result.push(
          await placeOrder(tx, {
            listing: p,
            buyerId: req.user.id,
            quantity: p.quantity,
            selection: p.selected_variants,
            address: req.body.address,
            method,
            cardSimulation: req.body.card_simulation,
          }),
        );
      }
      await tx.query("DELETE FROM cart_items WHERE buyer_id=$1", [req.user.id]);
      return result;
    });
    await audit(req.user.id, "cart.checked_out", null, {
      orders: orders.map((o) => o.id),
    });
    res.status(201).json(orders);
  },
);
accountRouter.patch(
  "/orders/:id/status",
  roles("seller"),
  validateId,
  validate(
    z
      .object({
        status: z.enum(["Pending", "Confirmed", "Packing", "Delivered"]),
      })
      .strict(),
  ),
  async (req, res) => {
    const updated = await one(
      "UPDATE orders SET status=$1 WHERE id=$2 AND seller_id=$3 AND (status=$1 OR (status='Pending' AND $1='Confirmed') OR (status='Confirmed' AND $1='Packing') OR (status='Packing' AND $1='Delivered')) RETURNING id,status",
      [req.body.status, req.params.id, req.user.id],
    );
    if (!updated)
      fail(
        409,
        "Order unavailable or invalid transition. Confirm pending orders before delivery.",
      );
    await audit(req.user.id, "order.status_updated", updated.id, {
      status: updated.status,
    });
    res.json(updated);
  },
);
