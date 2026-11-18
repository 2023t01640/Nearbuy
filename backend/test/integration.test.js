import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import request from "supertest";
import { Server } from "socket.io";
const requireFrontend = createRequire(
  new URL("../../frontend/package.json", import.meta.url),
);
const { io: client } = requireFrontend("socket.io-client");
process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "nearbuy-test-"));
process.env.UPLOAD_DIR = path.join(process.env.DATA_DIR, "uploads");
process.env.NODE_ENV = "test";
const { app } = await import("../src/app.js");
const { initDb, query, one, closeDb } = await import("../src/db.js");
const { hashPassword } = await import("../src/security.js");
const { setupSockets } = await import("../src/chat.js");
const http = createServer(app),
  io = new Server(http);
app.set("io", io);
setupSockets(io);
let seller, buyer, other, admin, listing, category, refreshCookie;
const pass = "NearBuy-strong-test-2026";
const auth = (t) => ({ Authorization: "Bearer " + t });
async function register(email, role) {
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Test " + role, email, password: pass, role });
  assert.equal(response.status, 201, response.text);
  return login(email);
}
async function login(email) {
  const r = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: pass });
  assert.equal(r.status, 200, r.text);
  return { ...r.body, cookie: r.headers["set-cookie"][0].split(";")[0] };
}
before(async () => {
  await initDb();
  await new Promise((r) => http.listen(0, "127.0.0.1", r));
});
after(async () => {
  io.close();
  await new Promise((r) => http.close(r));
  await closeDb();
});
test("Reject admin registration, weak passwords, XSS and untrusted origins", async () => {
  for (const change of [
    { role: "admin" },
    { password: "short" },
    { name: "<script>alert(1)</script>" },
  ]) {
    const r = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Test Buyer",
        email: "invalid@example.lk",
        password: pass,
        role: "buyer",
        ...change,
      });
    assert.equal(r.status, 400);
  }
  assert.equal(
    (
      await request(app)
        .get("/api/v1/categories")
        .set("Origin", "https://evil.example")
    ).status,
    403,
  );
  const r = await request(app).get("/api/v1/health");
  assert.ok(r.headers["x-content-type-options"]);
});
test("Accounts hash passwords and role/ownership gates reject unauthorized mutations", async () => {
  seller = await register("seller@example.lk", "seller");
  buyer = await register("buyer@example.lk", "buyer");
  other = await register("other@example.lk", "buyer");
  const row = await one("SELECT password_hash FROM users WHERE id=$1", [
    seller.user.id,
  ]);
  assert.ok(row.password_hash.startsWith("$argon2id$"));
  assert.notEqual(row.password_hash, pass);
  assert.equal(
    (await request(app).get("/api/v1/admin/users").set(auth(buyer.accessToken)))
      .status,
    403,
  );
  assert.equal((await request(app).get("/api/v1/admin/users")).status, 401);
  assert.equal(
    (
      await request(app)
        .post("/api/v1/listings")
        .set(auth(buyer.accessToken))
        .send({})
    ).status,
    403,
  );
  const aid = randomUUID();
  await query(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Admin','admin@example.lk',$2,'admin')",
    [aid, await hashPassword(pass)],
  );
  admin = await login("admin@example.lk");
  category = (await request(app).get("/api/v1/categories")).body[0].id;
});
test("Draft listings stay private until identity/phone/admin verification completes", async () => {
  const input = {
    title: "Teak study table",
    description: "A well cared for solid teak study table.",
    price: 18000,
    category_id: category,
    location: "Nugegoda",
    condition: "Good",
    images: [],
  };
  let r = await request(app)
    .post("/api/v1/listings")
    .set(auth(seller.accessToken))
    .send(input);
  assert.equal(r.status, 201, r.text);
  listing = r.body.id;
  assert.equal(r.body.status, "draft");
  assert.equal((await request(app).get("/api/v1/listings")).body.length, 0);
  assert.equal(
    (await request(app).get("/api/v1/listings/" + listing)).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .patch("/api/v1/admin/verifications/" + seller.user.id)
        .set(auth(admin.accessToken))
        .send({ decision: "verified", note: "Checked identity" })
    ).status,
    409,
  );
  r = await request(app)
    .post("/api/v1/verification")
    .set(auth(seller.accessToken))
    .send({
      identity_type: "nic",
      identity_number: "199512345678",
      phone: "+94771234567",
    });
  assert.equal(r.status, 200, r.text);
  const u = await one("SELECT * FROM users WHERE id=$1", [seller.user.id]);
  assert.ok(!u.identity_encrypted.includes("199512345678"));
  assert.equal(u.phone_verified, false);
  const outbox = JSON.parse(
    await readFile(
      path.join(process.env.DATA_DIR, "phone-outbox.json"),
      "utf8",
    ),
  );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/verification/confirm-phone")
        .set(auth(seller.accessToken))
        .send({ code: "000000" })
    ).status,
    400,
  );
  r = await request(app)
    .post("/api/v1/verification/confirm-phone")
    .set(auth(seller.accessToken))
    .send({ code: outbox.code });
  assert.equal(r.status, 200, r.text);
  r = await request(app)
    .patch("/api/v1/admin/verifications/" + seller.user.id)
    .set(auth(admin.accessToken))
    .send({ decision: "verified", note: "Identity and phone checked" });
  assert.equal(r.status, 200, r.text);
  assert.equal(
    (await request(app).get("/api/v1/listings")).body[0].status,
    "active",
  );
  assert.equal(
    (await request(app).get("/api/v1/listings?location=Kandy")).body.length,
    0,
  );
  assert.equal(
    (
      await request(app).get(
        "/api/v1/listings?q=" + encodeURIComponent("'; DROP TABLE users; --"),
      )
    ).status,
    200,
  );
  assert.ok(await one("SELECT id FROM users LIMIT 1"));
});
test("Reject spoofed image MIME and oversized images; re-encode valid images", async () => {
  let r = await request(app)
    .post("/api/v1/uploads")
    .set(auth(seller.accessToken))
    .attach("image", Buffer.from("<script>bad</script>"), {
      filename: "bad.jpg",
      contentType: "image/jpeg",
    });
  assert.equal(r.status, 400);
  r = await request(app)
    .post("/api/v1/uploads")
    .set(auth(seller.accessToken))
    .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), {
      filename: "huge.jpg",
      contentType: "image/jpeg",
    });
  assert.equal(r.status, 413);
  const sharp = (await import("sharp")).default;
  const png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  r = await request(app)
    .post("/api/v1/uploads")
    .set(auth(seller.accessToken))
    .attach("image", png, { filename: "valid.png", contentType: "image/png" });
  assert.equal(r.status, 201, r.text);
  assert.match(r.body.url, /\.webp$/);
});
test("Private chat emits only to participants; reviews require a buyer message", async () => {
  let r = await request(app)
    .post("/api/v1/listings/" + listing + "/reviews")
    .set(auth(buyer.accessToken))
    .send({ rating: 5, text: "Very helpful seller" });
  assert.equal(r.status, 403);
  const sock = client("http://127.0.0.1:" + http.address().port, {
    auth: { token: seller.accessToken },
    transports: ["websocket"],
  });
  await new Promise((resolve, reject) => {
    sock.once("connect", resolve);
    sock.once("connect_error", reject);
  });
  const live = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Error("No message event")), 5000);
    sock.once("message", (m) => {
      clearTimeout(t);
      resolve(m);
    });
  });
  r = await request(app)
    .post("/api/v1/listings/" + listing + "/messages")
    .set(auth(buyer.accessToken))
    .send({ text: "Is this still available?" });
  assert.equal(r.status, 201, r.text);
  assert.equal((await live).listing_id, listing);
  sock.disconnect();
  assert.equal(
    (
      await request(app)
        .get("/api/v1/listings/" + listing + "/messages")
        .set(auth(other.accessToken))
    ).body.length,
    0,
  );
  assert.equal(
    (
      await request(app)
        .get(
          "/api/v1/listings/" + listing + "/messages?buyer_id=" + buyer.user.id,
        )
        .set(auth(other.accessToken))
    ).body.length,
    0,
  );
  assert.equal(
    (
      await request(app)
        .get("/api/v1/listings/" + listing + "/messages")
        .set(auth(admin.accessToken))
    ).status,
    403,
  );
  r = await request(app)
    .post("/api/v1/listings/" + listing + "/messages")
    .set(auth(seller.accessToken))
    .send({
      text: "Yes, you can inspect it tomorrow.",
      buyer_id: buyer.user.id,
    });
  assert.equal(r.status, 201, r.text);
  r = await request(app)
    .post("/api/v1/listings/" + listing + "/reviews")
    .set(auth(buyer.accessToken))
    .send({ rating: 5, text: "Very helpful seller" });
  assert.equal(r.status, 201, r.text);
  assert.equal(
    (
      await request(app)
        .post("/api/v1/listings/" + listing + "/reviews")
        .set(auth(buyer.accessToken))
        .send({ rating: 5, text: "Duplicate review" })
    ).status,
    409,
  );
});
test("Real PDF/CSV reports, moderation, sold status and server audit trail", async () => {
  let r = await request(app)
    .post("/api/v1/listings/" + listing + "/flag")
    .set(auth(buyer.accessToken))
    .send({ reason: "Please check this listing" });
  assert.equal(r.status, 200);
  assert.equal(
    (await request(app).get("/api/v1/admin/flags").set(auth(admin.accessToken)))
      .body.length,
    1,
  );
  assert.equal(
    (
      await request(app)
        .patch("/api/v1/admin/flags/" + listing)
        .set(auth(admin.accessToken))
        .send({ decision: "approve" })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .patch("/api/v1/listings/" + listing + "/sold")
        .set(auth(seller.accessToken))
    ).status,
    200,
  );
  assert.equal((await request(app).get("/api/v1/listings")).body.length, 0);
  for (const [url, token, mime] of [
    ["seller/monthly-sales", seller.accessToken, "application/pdf"],
    ["seller/daily-inquiries", seller.accessToken, "text/csv"],
    ["admin/daily-activity", admin.accessToken, "application/pdf"],
    ["admin/monthly-audit", admin.accessToken, "text/csv"],
  ]) {
    r = await request(app)
      .get("/api/v1/reports/" + url)
      .set(auth(token));
    assert.equal(r.status, 200, r.text);
    assert.ok(r.headers["content-type"].startsWith(mime));
    if (mime === "application/pdf")
      assert.equal(r.body.subarray(0, 4).toString(), "%PDF");
    else assert.ok(r.text.includes(","));
  }
  assert.equal(
    (
      await request(app)
        .get("/api/v1/reports/admin/monthly-audit")
        .set(auth(seller.accessToken))
    ).status,
    403,
  );
  const logs = (
    await request(app).get("/api/v1/admin/audit").set(auth(admin.accessToken))
  ).body;
  assert.ok(logs.some((l) => l.action === "listing.flagged"));
  assert.ok(logs.some((l) => l.action === "seller.verification_verified"));
});
test("Refresh rotation, reuse detection, CSRF protection and suspension invalidate access", async () => {
  const s = await login("seller@example.lk");
  refreshCookie = s.cookie;
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", refreshCookie)
    ).status,
    403,
  );
  let r = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Cookie", refreshCookie)
    .set("Origin", "http://127.0.0.1:5175")
    .set("X-NearBuy-CSRF", "1");
  assert.equal(r.status, 200, r.text);
  const next = r.headers["set-cookie"][0].split(";")[0];
  assert.match(r.headers["set-cookie"][0], /HttpOnly/);
  r = await request(app)
    .post("/api/v1/auth/refresh")
    .set("Cookie", refreshCookie)
    .set("Origin", "http://127.0.0.1:5175")
    .set("X-NearBuy-CSRF", "1");
  assert.equal(r.status, 401);
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", next)
        .set("Origin", "http://127.0.0.1:5175")
        .set("X-NearBuy-CSRF", "1")
    ).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .patch("/api/v1/admin/users/" + buyer.user.id)
        .set(auth(admin.accessToken))
        .send({ status: "suspended" })
    ).status,
    200,
  );
  assert.equal(
    (await request(app).get("/api/v1/auth/me").set(auth(buyer.accessToken)))
      .status,
    401,
  );
  assert.equal((await request(app).get("/api-docs.json")).status, 200);
});

test("Enforce seller ownership, upload ownership and immediate logout revocation", async () => {
  const second = await register("second-seller@example.lk", "seller");
  assert.equal(
    (
      await request(app)
        .delete("/api/v1/listings/" + listing)
        .set(auth(second.accessToken))
    ).status,
    403,
  );
  const upload = await one("SELECT path FROM uploads WHERE owner_id=$1", [
    seller.user.id,
  ]);
  assert.equal(
    (
      await request(app)
        .post("/api/v1/listings")
        .set(auth(second.accessToken))
        .send({
          title: "Another seller item",
          description: "This is a different seller listing description.",
          price: 2000,
          category_id: category,
          condition: "Good",
          location: "Kandy",
          images: [upload.path],
        })
    ).status,
    403,
  );
  const r = await request(app)
    .post("/api/v1/auth/logout")
    .set("Cookie", second.cookie)
    .set("Origin", "http://127.0.0.1:5175")
    .set("X-NearBuy-CSRF", "1");
  assert.equal(r.status, 200);
  assert.equal(
    (await request(app).get("/api/v1/auth/me").set(auth(second.accessToken)))
      .status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .get("/api/v1/auth/me")
        .set(auth(second.accessToken + ".tampered"))
    ).status,
    401,
  );
});
test("Failed sign-ins are audited and rate limited", async () => {
  let limited = false;
  for (let i = 0; i < 11; i++) {
    const r = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "missing@example.lk", password: pass });
    if (r.status === 429) {
      limited = true;
      break;
    }
    assert.equal(r.status, 401);
  }
  assert.ok(limited);
  assert.ok(
    await one(
      "SELECT id FROM audit_logs WHERE action='auth.login_failed' LIMIT 1",
    ),
  );
});
