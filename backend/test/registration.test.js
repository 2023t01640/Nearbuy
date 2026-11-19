import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
process.env.NODE_ENV = "test";
process.env.DEMO_MODE = "false";
process.env.DATA_DIR = await mkdtemp(
  path.join(tmpdir(), "nearbuy-registration-"),
);
process.env.UPLOAD_DIR = path.join(process.env.DATA_DIR, "uploads");
const { app } = await import("../src/app.js");
const { initDb, one, query, closeDb } = await import("../src/db.js");
const { digest } = await import("../src/security.js");
before(initDb);
after(closeDb);
const buyer = {
  name: "Amaya Test",
  email: "amaya@test.lk",
  password: "A-strong-password-2026",
  role: "buyer",
  phone: "+94771234567",
};
test("Buyer registration requires a bound, verified, unexpired, single-use OTP challenge", async () => {
  const sent = await request(app)
    .post("/api/v1/auth/registration-otp")
    .send({ email: buyer.email, phone: buyer.phone });
  assert.equal(sent.status, 200, sent.text);
  assert.match(sent.body.devOtp, /^\d{6}$/);
  const body = { ...buyer, challengeId: sent.body.challengeId };
  assert.equal(
    (await request(app).post("/api/v1/auth/register").send(body)).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/confirm-registration-otp")
        .send({ challengeId: body.challengeId, code: sent.body.devOtp })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/register")
        .send({ ...body, phone: "+94771234568" })
    ).status,
    400,
  );
  const registered = await request(app)
    .post("/api/v1/auth/register")
    .send(body);
  assert.equal(registered.status, 201, registered.text);
  assert.equal(
    (
      await one("SELECT phone_verified FROM users WHERE email=$1", [
        buyer.email,
      ])
    ).phone_verified,
    true,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/register")
        .send({ ...body, email: "reuse@test.lk" })
    ).status,
    400,
  );
  const expired = await request(app)
    .post("/api/v1/auth/registration-otp")
    .send({ email: "expired@test.lk", phone: buyer.phone });
  await query(
    "UPDATE registration_codes SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [digest(expired.body.challengeId)],
  );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/confirm-registration-otp")
        .send({
          challengeId: expired.body.challengeId,
          code: expired.body.devOtp,
        })
    ).status,
    400,
  );
  const locked = await request(app)
    .post("/api/v1/auth/registration-otp")
    .send({ email: "locked@test.lk", phone: buyer.phone });
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await request(app)
          .post("/api/v1/auth/confirm-registration-otp")
          .send({ challengeId: locked.body.challengeId, code: "000000" })
      ).status,
      400,
    );
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/confirm-registration-otp")
        .send({
          challengeId: locked.body.challengeId,
          code: locked.body.devOtp,
        })
    ).status,
    400,
  );
});
test("Seller fields, agreement and genuine photo are mandatory on the server", async () => {
  const seller = {
    name: "Seller Test",
    email: "seller@test.lk",
    password: buyer.password,
    role: "seller",
    phone: buyer.phone,
    nic_number: "199512345678",
    product_category: "Other",
    address: "12 Temple Road, Colombo",
    district: "Colombo",
    seller_terms: "agree",
  };
  for (const change of [
    { seller_terms: "disagree" },
    { district: "Invalid district" },
    {},
  ]) {
    const result = await request(app)
      .post("/api/v1/auth/register")
      .field({ ...seller, ...change });
    assert.equal(result.status, 400, result.text);
  }
  const fake = await request(app)
    .post("/api/v1/auth/register")
    .field(seller)
    .attach("nic_photo", Buffer.from("<script>not an image</script>"), {
      filename: "fake.jpg",
      contentType: "image/jpeg",
    });
  assert.equal(fake.status, 400, fake.text);
  assert.equal(
    await one("SELECT id FROM users WHERE email=$1", [seller.email]),
    undefined,
  );
});
test("Mock OAuth is unavailable when demo mode is disabled", async () => {
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/mock-oauth")
        .send({ provider: "google" })
    ).status,
    404,
  );
});
