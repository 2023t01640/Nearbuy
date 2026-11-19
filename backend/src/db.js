import { districts } from "./districts.js";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { root } from "./config.js";
export const db = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : new PGlite(path.join(root, "postgres"));
export const query = (sql, params = []) => db.query(sql, params);
export const rows = async (sql, params = []) => (await query(sql, params)).rows;
export const one = async (sql, params = []) => (await rows(sql, params))[0];
export async function transaction(fn) {
  if (db.transaction) return db.transaction(fn);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function initDb() {
  const schema = await readFile(
    new URL("./schema.sql", import.meta.url),
    "utf8",
  );
  if (db.exec) await db.exec(schema);
  else await db.query(schema);
  for (const district of districts)
    await query(
      "UPDATE listings SET district=$1 WHERE district IS NULL AND (lower(location)=lower($1) OR location ILIKE $1 || ' %')",
      [district],
    );
  await query(
    "UPDATE listings SET district='Colombo' WHERE district IS NULL AND lower(location) IN ('homagama','nugegoda','maharagama','dehiwala','moratuwa','battaramulla','kollupitiya')",
  );
  await query(
    "UPDATE listings l SET district=u.location FROM users u WHERE l.seller_id=u.id AND l.district IS NULL AND u.location=ANY($1::text[])",
    [districts],
  );
  for (const name of [
    "Other",
    "Electronics",
    "Furniture",
    "Vehicles",
    "Fashion",
    "Sports",
    "Books & Hobbies",
  ])
    await query(
      "INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO NOTHING",
      [name],
    );
}
export async function closeDb() {
  if (db.close) await db.close();
  else await db.end();
}
