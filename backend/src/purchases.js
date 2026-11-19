import { randomUUID } from "node:crypto";
import { z } from "zod";
import { text, fail, encrypt } from "./security.js";
import { production } from "./config.js";
export const selectionSchema = z
  .record(text(1, 40), text(1, 60))
  .refine((o) => Object.keys(o).length <= 5)
  .default({});
export function validateSelection(listing, quantity, selection) {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 99 ||
    quantity > listing.stock_quantity
  )
    fail(409, "Requested quantity exceeds available stock");
  const variants = listing.variants || {};
  if (
    Object.keys(selection).length !== Object.keys(variants).length ||
    Object.entries(variants).some(
      ([name, options]) => !options.includes(selection[name]),
    )
  )
    fail(400, "Select an available option for every variant");
}
export async function placeOrder(
  tx,
  { listing: p, buyerId, quantity, selection, address, method, cardSimulation },
) {
  validateSelection(p, quantity, selection);
  if (!p.payment_methods.includes(method))
    fail(400, "Choose an enabled payment method");
  if (method === "Online Payment") {
    if (production)
      fail(503, "Online payments require a configured payment provider");
    if (cardSimulation !== true)
      fail(400, "Complete the demo card form before checkout");
  }
  if (
    (
      await tx.query(
        "SELECT id FROM orders WHERE listing_id=$1 AND buyer_id=$2",
        [p.id, buyerId],
      )
    ).rows.length
  )
    fail(409, "You already ordered this product");
  const totalCents = Math.round(Number(p.price) * 100) * quantity,
    feeCents = Math.round((totalCents * 7) / 100);
  const changed = await tx.query(
    "UPDATE listings SET stock_quantity=stock_quantity-$1,updated_at=now() WHERE id=$2 AND stock_quantity >= $1 RETURNING id",
    [quantity, p.id],
  );
  if (!changed.rows.length) fail(409, "Insufficient stock");
  return (
    await tx.query(
      "INSERT INTO orders(id,listing_id,buyer_id,seller_id,product_name,total,address_encrypted,payment_method,quantity,unit_price,selected_variants,platform_fee,net_payout,payment_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id,listing_id,product_name,total,quantity,selected_variants,platform_fee,net_payout,status,payment_method,payment_status,created_at",
      [
        randomUUID(),
        p.id,
        buyerId,
        p.seller_id,
        p.title,
        (totalCents / 100).toFixed(2),
        encrypt(address),
        method,
        quantity,
        p.price,
        JSON.stringify(selection),
        (feeCents / 100).toFixed(2),
        ((totalCents - feeCents) / 100).toFixed(2),
        method === "Online Payment" ? "simulated" : "unpaid",
      ],
    )
  ).rows[0];
}
