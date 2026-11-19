import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { rows, one, query } from "./db.js";
import {
  auth,
  roles,
  validate,
  text,
  id,
  validateId,
  fail,
  limit,
  audit,
  authenticateToken,
  decode,
} from "./security.js";
import { getListing, canSee } from "./marketplace.js";
export const chatRouter = Router();
chatRouter.use(auth, roles("buyer", "seller"));
async function participant(req) {
  const p = await getListing(req.params.id);
  if (!canSee(p, req.user)) fail(404, "Listing not found");
  let buyer = req.user.id;
  if (req.user.role === "seller") {
    if (p.seller_id !== req.user.id) fail(403, "Not your conversation");
    buyer = req.query.buyer_id || req.body.buyer_id;
    if (!id.safeParse(buyer).success) fail(400, "buyer_id is required");
    if (
      !(await one(
        "SELECT id FROM messages WHERE listing_id=$1 AND buyer_id=$2 LIMIT 1",
        [p.id, buyer],
      ))
    )
      fail(403, "Buyer must start the conversation");
  }
  return { p, buyer };
}
chatRouter.get("/conversations", async (req, res) => {
  res.json(
    await rows(
      `SELECT m.listing_id,m.buyer_id,l.title,u.name AS buyer_name,max(m.created_at) AS last_message_at FROM messages m JOIN listings l ON l.id=m.listing_id JOIN users u ON u.id=m.buyer_id WHERE ($1='buyer' AND m.buyer_id=$2) OR ($1='seller' AND l.seller_id=$2) GROUP BY m.listing_id,m.buyer_id,l.title,u.name ORDER BY last_message_at DESC`,
      [req.user.role, req.user.id],
    ),
  );
});
chatRouter.get("/listings/:id/messages", validateId, async (req, res) => {
  const { p, buyer } = await participant(req);
  res.json(
    await rows(
      "SELECT m.id,m.listing_id,m.buyer_id,m.sender_id,m.body AS text,m.created_at AS time,u.name AS sender FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.listing_id=$1 AND m.buyer_id=$2 ORDER BY m.created_at DESC LIMIT 200",
      [p.id, buyer],
    ).then((r) => r.reverse()),
  );
});
chatRouter.post(
  "/listings/:id/messages",
  limit(30, 60000),
  validateId,
  validate(z.object({ text: text(1, 1000), buyer_id: id.optional() }).strict()),
  async (req, res) => {
    const { p, buyer } = await participant(req);
    if (p.status !== "approved") fail(409, "This listing is no longer available");
    const seller = await one("SELECT status FROM users WHERE id=$1", [
      p.seller_id,
    ]);
    if (seller.status !== "active") fail(403, "Seller is unavailable");
    const m = await one(
      "INSERT INTO messages(id,listing_id,buyer_id,sender_id,body) VALUES($1,$2,$3,$4,$5) RETURNING id,listing_id,buyer_id,sender_id,body AS text,created_at AS time",
      [randomUUID(), p.id, buyer, req.user.id, req.body.text],
    );
    await audit(req.user.id, "message.sent", p.id);
    req.app
      .get("io")
      ?.to("user:" + buyer)
      .to("user:" + p.seller_id)
      .emit("message", m);
    res.status(201).json(m);
  },
);
export function setupSockets(io) {
  io.use(async (socket, next) => {
    try {
      socket.user = await authenticateToken(socket.handshake.auth?.token);
      if (!["buyer", "seller"].includes(socket.user.role))
        fail(403, "Chat requires a buyer or seller account");
      socket.claims = decode(socket.handshake.auth.token);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    socket.join("user:" + socket.user.id);
    socket.join("family:" + socket.claims.sid);
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.claims.exp * 1000 - Date.now()),
    );
    socket.on("disconnect", () => clearTimeout(timer));
  });
}
