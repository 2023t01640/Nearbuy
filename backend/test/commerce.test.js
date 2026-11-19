import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
process.env.NODE_ENV = "test";
process.env.DEMO_MODE = "false";
process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "nearbuy-commerce-"));
process.env.UPLOAD_DIR = path.join(process.env.DATA_DIR, "uploads");
const { app } = await import("../src/app.js");
const { initDb, query, one, closeDb } = await import("../src/db.js");
const { hashPassword, decrypt } = await import("../src/security.js");
const sessions = {};
let complete, listing;
const auth = (role) => ({
  Authorization: "Bearer " + sessions[role].accessToken,
});
before(async () => {
  await initDb();
  const hash = await hashPassword("Commerce-test-2026!");
  for (const role of ["seller", "buyer", "admin"]) {
    await query(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$2)",
      [randomUUID(), role, role + "@commerce.lk", hash],
    );
    const r = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: role + "@commerce.lk", password: "Commerce-test-2026!" });
    assert.equal(r.status, 200, r.text);
    sessions[role] = r.body;
  }
  const image = "/uploads/" + randomUUID() + ".webp";
  await query("INSERT INTO uploads(path,owner_id) VALUES($1,$2)", [
    image,
    sessions.seller.user.id,
  ]);
  complete = {
    title: "Handmade teak desk",
    stock_quantity: 10,
    district: "Kandy",
    size_weight: "100 x 60 x 75 cm; 15 kg",
    images: [image],
    description: "Solid teak desk in excellent condition.",
    category_id: (await one("SELECT id FROM categories WHERE name='Other'")).id,
    condition: "Good",
    price: 24000,
    payment_methods: ["Cash on Delivery"],
    location: "Kandy",
  };
});
after(closeDb);
test("All eight details auto-approve; omitting any detail queues privately; eight photos accepted, nine rejected", async () => {
  const r = await request(app)
    .post("/api/v1/listings")
    .set(auth("seller"))
    .send(complete);
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.status, "approved");
  listing = r.body.id;
  for (const field of [
    "title",
    "size_weight",
    "images",
    "description",
    "category_id",
    "condition",
    "price",
    "payment_methods",
  ]) {
    const b = { ...complete };
    delete b[field];
    const pending = await request(app)
      .post("/api/v1/listings")
      .set(auth("seller"))
      .send(b);
    assert.equal(pending.status, 201, pending.text);
    assert.equal(pending.body.status, "pending_admin", field);
    assert.equal(
      (await request(app).get("/api/v1/listings/" + pending.body.id)).status,
      404,
    );
  }
  const images = [complete.images[0]];
  for (let i = 1; i < 9; i++) {
    const image = "/uploads/" + randomUUID() + ".webp";
    await query("INSERT INTO uploads(path,owner_id) VALUES($1,$2)", [
      image,
      sessions.seller.user.id,
    ]);
    images.push(image);
  }
  assert.equal(
    (
      await request(app)
        .put("/api/v1/listings/" + listing)
        .set(auth("seller"))
        .send({ ...complete, images: images.slice(0, 8) })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .put("/api/v1/listings/" + listing)
        .set(auth("seller"))
        .send({ ...complete, images })
    ).status,
    400,
  );
  const all = await request(app).get("/api/v1/listings");
  assert.equal(all.body.length, 1);
});
test("Admin can inspect missing details and approve/reject; seller cannot bypass moderation role", async () => {
  assert.equal(
    (
      await request(app)
        .get("/api/v1/admin/listing-approvals")
        .set(auth("seller"))
    ).status,
    403,
  );
  const queue = await request(app)
    .get("/api/v1/admin/listing-approvals")
    .set(auth("admin"));
  assert.equal(queue.body.length, 8);
  assert.ok(queue.body.every((p) => p.missing_details.length));
  const id = queue.body[0].id;
  assert.equal(
    (
      await request(app)
        .patch("/api/v1/admin/listing-approvals/" + id)
        .set(auth("admin"))
        .send({ decision: "approved", note: "Manually inspected" })
    ).status,
    200,
  );
  assert.equal((await request(app).get("/api/v1/listings/" + id)).status, 200);
  assert.equal(
    (
      await request(app)
        .put("/api/v1/listings/" + id)
        .set(auth("seller"))
        .send({ ...complete, size_weight: "" })
    ).body.status,
    "pending_admin",
  );
  assert.equal(
    (
      await request(app)
        .patch("/api/v1/admin/listing-approvals/" + id)
        .set(auth("admin"))
        .send({ decision: "removed", note: "Missing essential details" })
    ).status,
    200,
  );
});
test("Orders enforce buyer role, availability, seller payment choices, snapshots and duplicate protection; only purchases unlock reviews", async () => {
  const url = "/api/v1/listings/" + listing;
  const order = {
    address: "23 Lake Road, Kandy, Sri Lanka",
    payment_method: "Cash on Delivery",
  };
  assert.equal(
    (
      await request(app)
        .post(url + "/orders")
        .send(order)
    ).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .post(url + "/orders")
        .set(auth("seller"))
        .send(order)
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post(url + "/orders")
        .set(auth("buyer"))
        .send({ ...order, payment_method: "Online Payment" })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post(url + "/orders")
        .set(auth("buyer"))
        .send({ ...order, total: 1 })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post(url + "/reviews")
        .set(auth("buyer"))
        .send({ rating: 5, text: "Not purchased" })
    ).status,
    403,
  );
  const placed = await request(app)
    .post(url + "/orders")
    .set(auth("buyer"))
    .send(order);
  assert.equal(placed.status, 201, placed.text);
  assert.equal(Number(placed.body.total), 24000);
  assert.equal(placed.body.payment_status, "unpaid");
  const stored = await one("SELECT * FROM orders WHERE id=$1", [
    placed.body.id,
  ]);
  assert.equal(decrypt(stored.address_encrypted), order.address);
  assert.ok(!stored.address_encrypted.includes("Kandy"));
  assert.equal((await request(app).get("/api/v1/orders")).status, 401);
  const sellerOrders = await request(app)
    .get("/api/v1/orders")
    .set(auth("seller"));
  assert.equal(sellerOrders.body[0].address, order.address);
  assert.equal(sellerOrders.headers["cache-control"], "no-store");
  assert.equal(
    (await request(app).get("/api/v1/orders").set(auth("admin"))).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post(url + "/orders")
        .set(auth("buyer"))
        .send(order)
    ).status,
    409,
  );
  assert.equal(
    (await request(app).get(url).set(auth("buyer"))).body.can_review,
    true,
  );
  assert.equal((await request(app).get(url)).body.can_review, false);
  const review = await request(app)
    .post(url + "/reviews")
    .set(auth("buyer"))
    .send({ rating: 4, text: "Good desk and helpful seller" });
  assert.equal(review.status, 201, review.text);
  assert.equal(
    (
      await request(app)
        .patch("/api/v1/reviews/" + review.body.id)
        .set(auth("buyer"))
        .send({ rating: 5, text: "Excellent after delivery" })
    ).status,
    200,
  );
  const detail = await request(app).get(url);
  assert.equal(Number(detail.body.seller_rating), 5);
  assert.equal(detail.body.seller_review_count, 1);
  assert.equal(
    (await request(app).get(url + "/reviews")).body[0].verified_purchase,
    true,
  );
  const pending = await request(app)
    .post("/api/v1/listings")
    .set(auth("seller"))
    .send({});
  assert.equal(
    (
      await request(app)
        .post("/api/v1/listings/" + pending.body.id + "/orders")
        .set(auth("buyer"))
        .send(order)
    ).status,
    409,
  );
});

test("Persistent cart checkout is atomic and seller order status/reports are scoped", async () => {
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const r = await request(app)
      .post("/api/v1/listings")
      .set(auth("seller"))
      .send({ ...complete, title: "Cart product " + i });
    assert.equal(r.status, 201, r.text);
    ids.push(r.body.id);
  }
  assert.equal(
    (
      await request(app)
        .put("/api/v1/cart/" + ids[0])
        .set(auth("seller"))
        .send({ quantity: 2 })
    ).status,
    403,
  );
  for (const id of ids)
    assert.equal(
      (
        await request(app)
          .put("/api/v1/cart/" + id)
          .set(auth("buyer"))
          .send({ quantity: 2 })
      ).status,
      200,
    );
  assert.equal(
    (
      await request(app)
        .put("/api/v1/cart/" + ids[0])
        .set(auth("buyer"))
        .send({ quantity: 0 })
    ).status,
    400,
  );
  const body = {
    address: "44 Lake Road, Kandy, Sri Lanka",
    payments: { [ids[0]]: "Cash on Delivery", [ids[1]]: "Online Payment" },
  };
  assert.equal(
    (
      await request(app)
        .post("/api/v1/cart/checkout")
        .set(auth("buyer"))
        .send(body)
    ).status,
    400,
  );
  assert.equal(
    (
      await one("SELECT count(*)::int AS n FROM orders WHERE listing_id=$1", [
        ids[0],
      ])
    ).n,
    0,
  );
  assert.equal(
    (await request(app).get("/api/v1/cart").set(auth("buyer"))).body.length,
    2,
  );
  body.payments[ids[1]] = "Cash on Delivery";
  const checkout = await request(app)
    .post("/api/v1/cart/checkout")
    .set(auth("buyer"))
    .send(body);
  assert.equal(checkout.status, 201, checkout.text);
  assert.equal(checkout.body.length, 2);
  assert.equal(Number(checkout.body[0].total), 48000);
  assert.equal(checkout.body[0].quantity, 2);
  assert.equal(checkout.body[0].status, "Pending");
  assert.equal(
    (await request(app).get("/api/v1/cart").set(auth("buyer"))).body.length,
    0,
  );
  const statusUrl = "/api/v1/orders/" + checkout.body[0].id + "/status";
  assert.equal(
    (
      await request(app)
        .patch(statusUrl)
        .set(auth("buyer"))
        .send({ status: "Confirmed" })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .patch(statusUrl)
        .set(auth("seller"))
        .send({ status: "Delivered" })
    ).status,
    409,
  );
  for (const status of ["Confirmed", "Packing", "Delivered"])
    assert.equal(
      (await request(app).patch(statusUrl).set(auth("seller")).send({ status }))
        .status,
      200,
    );
  assert.equal(
    (
      await request(app)
        .patch(statusUrl)
        .set(auth("seller"))
        .send({ status: "Pending" })
    ).status,
    409,
  );
  for (const kind of ["sales", "listings"])
    for (const format of ["pdf", "csv"]) {
      const r = await request(app)
        .get(`/api/v1/reports/seller/${kind}/${format}`)
        .set(auth("seller"));
      assert.equal(r.status, 200, r.text);
      assert.match(
        r.headers["content-type"],
        format === "pdf" ? /application\/pdf/ : /text\/csv/,
      );
    }
  assert.equal(
    (
      await request(app)
        .get("/api/v1/reports/seller/sales/pdf")
        .set(auth("buyer"))
    ).status,
    403,
  );
});
test("Stock, variants, district filters and simulated online fees are enforced", async () => {
  const variantInput = {
    ...complete,
    stock_quantity: 2,
    variants: { Colors: ["Black", "Blue"], Storage: ["128GB", "256GB"] },
    payment_methods: ["Cash on Delivery", "Online Payment"],
  };
  const created = await request(app)
    .post("/api/v1/listings")
    .set(auth("seller"))
    .send(variantInput);
  assert.equal(created.status, 201, created.text);
  const url = "/api/v1/listings/" + created.body.id + "/orders";
  const body = {
    address: "44 Lake Road, Kandy, Sri Lanka",
    quantity: 2,
    selected_variants: { Colors: "Black", Storage: "256GB" },
    payment_method: "Online Payment",
  };
  assert.equal(
    (
      await request(app)
        .post(url)
        .set(auth("buyer"))
        .send({ ...body, quantity: 3 })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .post(url)
        .set(auth("buyer"))
        .send({
          ...body,
          selected_variants: { Colors: "Green", Storage: "256GB" },
        })
    ).status,
    400,
  );
  assert.equal(
    (await request(app).post(url).set(auth("buyer")).send(body)).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post(url)
        .set(auth("buyer"))
        .send({ ...body, card_number: "4242424242424242" })
    ).status,
    400,
  );
  const purchased = await request(app)
    .post(url)
    .set(auth("buyer"))
    .send({ ...body, card_simulation: true });
  assert.equal(purchased.status, 201, purchased.text);
  assert.equal(purchased.body.payment_status, "simulated");
  assert.equal(Number(purchased.body.platform_fee), 3360);
  assert.equal(Number(purchased.body.net_payout), 44640);
  assert.deepEqual(purchased.body.selected_variants, body.selected_variants);
  assert.equal(
    (
      await one("SELECT stock_quantity FROM listings WHERE id=$1", [
        created.body.id,
      ])
    ).stock_quantity,
    0,
  );
  const results = await request(app).get("/api/v1/listings?location=Kandy");
  assert.ok(results.body.some((p) => p.id === created.body.id));
  assert.equal(
    (
      await request(app)
        .put("/api/v1/cart/" + created.body.id)
        .set(auth("buyer"))
        .send({ quantity: 1, selected_variants: body.selected_variants })
    ).status,
    409,
  );
});

test("Concurrent buyers cannot oversell the last unit", async () => {
  const created = await request(app)
    .post("/api/v1/listings")
    .set(auth("seller"))
    .send({ ...complete, stock_quantity: 1 });
  const uid = randomUUID();
  await query(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Other buyer','other-stock@test.lk',$2,'buyer')",
    [uid, await hashPassword("Other-stock-test-2026!")],
  );
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "other-stock@test.lk", password: "Other-stock-test-2026!" });
  assert.equal(login.status, 200, login.text);
  const body = {
    address: "23 Lake Road, Kandy, Sri Lanka",
    payment_method: "Cash on Delivery",
  };
  const url = "/api/v1/listings/" + created.body.id + "/orders";
  const results = await Promise.all([
    request(app).post(url).set(auth("buyer")).send(body),
    request(app)
      .post(url)
      .set({ Authorization: "Bearer " + login.body.accessToken })
      .send(body),
  ]);
  assert.deepEqual(
    results.map((r) => r.status).sort(),
    [201, 409],
    results.map((r) => r.text).join(" "),
  );
  assert.equal(
    (
      await one("SELECT stock_quantity FROM listings WHERE id=$1", [
        created.body.id,
      ])
    ).stock_quantity,
    0,
  );
  assert.equal(
    (
      await one("SELECT count(*)::int AS n FROM orders WHERE listing_id=$1", [
        created.body.id,
      ])
    ).n,
    1,
  );
});

test("Buyer profile encrypts private fields and password changes revoke sessions", async () => {
  const profile = {
    name: "Updated Buyer",
    phone: "+94771234567",
    address: "20 Temple Lane, Colombo, Sri Lanka",
  };
  const saved = await request(app)
    .patch("/api/v1/profile")
    .set(auth("buyer"))
    .send(profile);
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.body.address, profile.address);
  assert.equal(
    (await request(app).get("/api/v1/profile").set(auth("buyer"))).body.name,
    profile.name,
  );
  const row = await one("SELECT address_encrypted FROM users WHERE id=$1", [
    sessions.buyer.user.id,
  ]);
  assert.ok(!row.address_encrypted.includes("Temple"));
  assert.equal(
    (
      await request(app)
        .post("/api/v1/profile/password")
        .set(auth("buyer"))
        .send({
          current_password: "wrong",
          password: "New-strong-password-2026!",
        })
    ).status,
    403,
  );
  const changed = await request(app)
    .post("/api/v1/profile/password")
    .set(auth("buyer"))
    .send({
      current_password: "Commerce-test-2026!",
      password: "New-strong-password-2026!",
    });
  assert.equal(changed.status, 200, changed.text);
  assert.equal(
    (await request(app).get("/api/v1/profile").set(auth("buyer"))).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "buyer@commerce.lk", password: "Commerce-test-2026!" })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(app).post("/api/v1/auth/login").send({
        email: "buyer@commerce.lk",
        password: "New-strong-password-2026!",
      })
    ).status,
    200,
  );
});
