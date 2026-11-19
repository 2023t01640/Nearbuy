import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
process.env.NODE_ENV = "test";
process.env.DEMO_MODE = "true";
process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "nearbuy-seed-"));
process.env.UPLOAD_DIR = path.join(process.env.DATA_DIR, "uploads");
const { initDb, one, rows, query, closeDb } = await import("../src/db.js");
const { seedDemo, fixtureId } = await import("../src/seed.js");
const { demoAccounts, demoPassword } = await import("../src/demo-data.js");
const { app } = await import("../src/app.js");
after(closeDb);
test("Empty-startup seed creates all presentation records, local images and eligible reviews", async () => {
  await initDb();
  const result = await seedDemo({ onlyIfEmpty: true });
  assert.equal(result.accounts, 6);
  assert.equal(Number((await one("SELECT count(*) AS n FROM users")).n), 6);
  const sellers = await rows("SELECT * FROM users WHERE role='seller'");
  assert.equal(sellers.length, 3);
  assert.deepEqual(sellers.map((s) => s.location).sort(), [
    "Colombo",
    "Galle",
    "Kandy",
  ]);
  assert.ok(
    sellers.every(
      (s) =>
        s.verification_status === "verified" && s.phone_verified && s.is_demo,
    ),
  );
  assert.equal(
    Number((await one("SELECT count(*) AS n FROM users WHERE role='buyer'")).n),
    2,
  );
  assert.equal(
    Number((await one("SELECT count(*) AS n FROM users WHERE role='admin'")).n),
    1,
  );
  const listings = await rows("SELECT * FROM listings");
  assert.equal(listings.length, 10);
  for (const p of listings) {
    assert.ok(Object.keys(p.specs).length >= 4);
    assert.equal(p.status, "approved");
    await access(path.join(process.env.UPLOAD_DIR, path.basename(p.images[0])));
  }
  assert.equal(Number((await one("SELECT count(*) AS n FROM messages")).n), 40);
  assert.equal(
    Number(
      (
        await one(
          "SELECT count(*) AS n FROM reviews r WHERE rating BETWEEN 4 AND 5 AND EXISTS(SELECT 1 FROM messages m WHERE m.listing_id=r.listing_id AND m.sender_id=r.buyer_id AND m.buyer_id=r.buyer_id)",
        )
      ).n,
    ),
    10,
  );
});
test("Quick login offers three roles; all six accounts authenticate normally", async () => {
  const options = await request(app).get("/api/v1/auth/demo-accounts");
  assert.equal(options.status, 200);
  assert.equal(options.body.length, 3);
  assert.equal(options.headers["cache-control"], "no-store");
  for (const account of demoAccounts) {
    const r = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: account.email, password: demoPassword });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.role, account.role);
    if (account.role === "seller")
      assert.equal(r.body.user.verification_status, "verified");
  }
});
test("Repeated seeds do not duplicate records or undo live presentation changes", async () => {
  const lid = fixtureId("listing:headphones");
  await query("UPDATE listings SET status='sold',sold_at=now() WHERE id=$1", [
    lid,
  ]);
  assert.equal((await seedDemo({ onlyIfEmpty: true })).skipped, true);
  await seedDemo();
  assert.equal(Number((await one("SELECT count(*) AS n FROM listings")).n), 10);
  assert.equal(Number((await one("SELECT count(*) AS n FROM messages")).n), 40);
  assert.equal(Number((await one("SELECT count(*) AS n FROM reviews")).n), 10);
  assert.equal(
    (await one("SELECT status FROM listings WHERE id=$1", [lid])).status,
    "sold",
  );
});

test("Mock OAuth creates isolated buyer accounts and reuses each provider account", async () => {
  for (const provider of ["google", "facebook", "apple"]) {
    const result = await request(app)
      .post("/api/v1/auth/mock-oauth")
      .send({ provider });
    assert.equal(result.status, 200, result.text);
    assert.equal(result.body.user.role, "buyer");
    assert.ok(result.headers["set-cookie"][0].includes("HttpOnly"));
    const again = await request(app)
      .post("/api/v1/auth/mock-oauth")
      .send({ provider });
    assert.equal(again.body.user.id, result.body.user.id);
    assert.equal(
      (
        await request(app)
          .get("/api/v1/auth/me")
          .set("Authorization", "Bearer " + again.body.accessToken)
      ).status,
      200,
    );
  }
  assert.equal(
    (
      await request(app)
        .post("/api/v1/auth/mock-oauth")
        .send({ provider: "google", email: "admin@nearbuy.local" })
    ).status,
    400,
  );
});
