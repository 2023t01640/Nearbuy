import { districts } from "./districts.js";
import { createHash } from "node:crypto";
import { copyFile, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { config, demoEnabled, production, root } from "./config.js";
import { query, one, rows, transaction } from "./db.js";
import { hashPassword, encrypt, logger } from "./security.js";
import { demoAccounts, demoListings, demoPassword } from "./demo-data.js";
export function fixtureId(key) {
  const h = createHash("sha256")
    .update("nearbuy-presentation-v1:" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export async function seedDemo({ onlyIfEmpty = false } = {}) {
  if (production || !demoEnabled) {
    if (onlyIfEmpty) return { skipped: true };
    throw new Error(
      "Demo seeding requires local DEMO_MODE and is forbidden in production.",
    );
  }
  if (onlyIfEmpty) {
    const count = await one(
      "SELECT (SELECT count(*) FROM listings) AS listings,(SELECT count(*) FROM users WHERE email!='admin@nearbuy.local') AS users",
    );
    if (Number(count.listings) || Number(count.users)) return { skipped: true };
  }
  // Check/download assets before opening the transaction. The seed itself never needs network.
  for (const item of demoListings) {
    const source = new URL(
      "../assets/demo/" + item.key + ".webp",
      import.meta.url,
    );
    await access(source);
    await copyFile(
      source,
      path.join(config.uploadDir, fixtureId("image:" + item.key) + ".webp"),
    );
  }
  const hashes = new Map();
  for (const account of demoAccounts)
    hashes.set(account.key, await hashPassword(demoPassword));
  const now = new Date(),
    base = new Date(now);
  base.setHours(9, 0, 0, 0);
  if (base > now) base.setDate(base.getDate() - 1);
  const result = await transaction(async (tx) => {
    const get = async (sql, params = []) =>
      (await tx.query(sql, params)).rows[0];
    const ids = {};
    for (const [i, a] of demoAccounts.entries()) {
      const existing = await get(
        "SELECT id,name,role,is_demo FROM users WHERE email=$1",
        [a.email],
      );
      if (
        existing &&
        !existing.is_demo &&
        !(
          a.key === "admin" &&
          existing.name === "NearBuy Admin" &&
          existing.role === "admin"
        )
      )
        throw new Error("Refusing to overwrite non-demo account: " + a.email);
      const uid = existing?.id || fixtureId("user:" + a.key);
      ids[a.key] = uid;
      if (!existing)
        await tx.query(
          "INSERT INTO users(id,name,email,password_hash,role,verification_status,phone_verified,identity_type,identity_encrypted,phone_encrypted,verification_note,location,is_demo) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)",
          [
            uid,
            a.name,
            a.email,
            hashes.get(a.key),
            a.role,
            a.role === "seller" ? "verified" : "unverified",
            a.role === "seller",
            a.role === "seller" ? "business" : null,
            a.role === "seller" ? encrypt("DEMO-BR-" + (1000 + i)) : null,
            a.role === "seller" ? encrypt("DEMO-PHONE-NOT-REAL") : null,
            a.role === "seller"
              ? "Fictional seller approved for university demonstration."
              : null,
            a.location,
          ],
        );
      // Adopt only the local bootstrap admin, once; never reset edited demo records on repeated seeds.
      else if (!existing.is_demo) {
        await tx.query(
          "UPDATE users SET password_hash=$1,is_demo=true,location=$2 WHERE id=$3",
          [hashes.get(a.key), a.location, uid],
        );
        await tx.query(
          "UPDATE session_families SET revoked=true WHERE user_id=$1",
          [uid],
        );
      }
    }
    for (const [i, p] of demoListings.entries()) {
      const category = await get("SELECT id FROM categories WHERE name=$1", [
        p.category,
      ]);
      if (!category) throw new Error("Missing category " + p.category);
      const lid = fixtureId("listing:" + p.key),
        image = "/uploads/" + fixtureId("image:" + p.key) + ".webp",
        seller = ids[p.seller],
        buyer = ids[i % 2 ? "buyer-tharindu" : "buyer-amaya"];
      const created = new Date(base.getTime() - ((i % 4) + 1) * 86400000),
        chatTime = new Date(base.getTime() + i * 120000);
      await tx.query(
        "INSERT INTO uploads(path,owner_id) VALUES($1,$2) ON CONFLICT(path) DO NOTHING",
        [image, seller],
      );
      await tx.query(
        "INSERT INTO listings(id,seller_id,category_id,title,description,price,location,condition,status,images,specs,created_at,flagged,flag_reason,payment_methods) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9,$10,$11,$12,$13,jsonb_build_array('Cash on Delivery')) ON CONFLICT(id) DO NOTHING",
        [
          lid,
          seller,
          category.id,
          p.title,
          p.description,
          p.price,
          p.location,
          p.condition,
          JSON.stringify([image]),
          JSON.stringify(p.specs),
          created,
          p.key === "watch",
          p.key === "watch"
            ? "Demo moderation example: buyer requested clearer photographs of strap wear."
            : null,
        ],
      );
      await tx.query(
        "UPDATE listings SET district=$1 WHERE id=$2 AND district IS NULL",
        [districts.find((d) => p.location.startsWith(d)) || null, lid],
      );
      const conversation = [
        { sender: buyer, text: p.question },
        { sender: seller, text: p.reply },
        {
          sender: buyer,
          text: "Thank you for the details. That works for me. I will confirm the collection time here.",
        },
        {
          sender: seller,
          text: "Sounds good. Please message before leaving so I can have everything ready.",
        },
      ];
      for (const [j, m] of conversation.entries())
        await tx.query(
          "INSERT INTO messages(id,listing_id,buyer_id,sender_id,body,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
          [
            fixtureId(`message:${p.key}:${j}`),
            lid,
            buyer,
            m.sender,
            m.text,
            new Date(chatTime.getTime() + j * 60000),
          ],
        );
      await tx.query(
        "INSERT INTO reviews(id,listing_id,buyer_id,rating,body,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(listing_id,buyer_id) DO NOTHING",
        [
          fixtureId("review:" + p.key),
          lid,
          buyer,
          p.rating,
          p.review,
          new Date(chatTime.getTime() + 5 * 60000),
        ],
      );
      await tx.query(
        "INSERT INTO audit_logs(id,actor_id,action,target,metadata,created_at) VALUES($1,$2,'listing.created',$3,$4,$5) ON CONFLICT(id) DO NOTHING",
        [
          fixtureId("audit:" + p.key),
          seller,
          lid,
          JSON.stringify({ demo: true }),
          created,
        ],
      );
    }
    for (const a of demoAccounts.filter((a) => a.role === "seller"))
      await tx.query(
        "INSERT INTO audit_logs(id,actor_id,action,target,metadata) VALUES($1,$2,'seller.verification_verified',$3,$4) ON CONFLICT(id) DO NOTHING",
        [
          fixtureId("verification:" + a.key),
          ids.admin,
          ids[a.key],
          JSON.stringify({ demo: true }),
        ],
      );
    await tx.query(
      "INSERT INTO audit_logs(id,actor_id,action,target,metadata) VALUES($1,$2,'demo.seed_completed','presentation-v1',$3) ON CONFLICT(id) DO NOTHING",
      [
        fixtureId("audit:seed"),
        ids.admin,
        JSON.stringify({
          accounts: 6,
          listings: 10,
          messages: 40,
          reviews: 10,
        }),
      ],
    );
    return { accounts: 6, listings: 10, messages: 40, reviews: 10 };
  });
  await writeFile(
    path.join(root, "local-admin.txt"),
    `University demo administrator\nEmail: admin@nearbuy.local\nPassword: ${demoPassword}\n\nFictional local demo account. Production demo login is disabled.\n`,
    { mode: 0o600 },
  );
  await writeFile(
    path.join(root, "demo-accounts.txt"),
    demoAccounts
      .map(
        (a) =>
          `${a.name} | ${a.role} | ${a.location}\n${a.email}\n${demoPassword}\n`,
      )
      .join("\n"),
    { mode: 0o600 },
  );
  logger.info({ event: "demo.seed_completed", ...result });
  return result;
}
export async function availableDemoLogins() {
  if (!demoEnabled) return [];
  const active = await rows(
    "SELECT email FROM users WHERE is_demo=true AND status=$1",
    ["active"],
  );
  return demoAccounts
    .filter((a) => a.label && active.some((u) => u.email === a.email))
    .map((a) => ({
      label: a.label,
      name: a.name,
      role: a.role,
      email: a.email,
      password: demoPassword,
    }));
}
export async function guardDemoProduction() {
  if (
    production &&
    (await one("SELECT id FROM users WHERE is_demo=true LIMIT 1"))
  )
    throw new Error(
      "This database contains presentation accounts. Use a separate clean production database.",
    );
}
