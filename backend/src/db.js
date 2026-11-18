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
export async function initDb() {
  const schema = await readFile(
    new URL("./schema.sql", import.meta.url),
    "utf8",
  );
  if (db.exec) await db.exec(schema);
  else await db.query(schema);
  for (const name of [
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
