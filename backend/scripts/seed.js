import { initDb, closeDb } from "../src/db.js";
import { seedDemo } from "../src/seed.js";
try {
  await initDb();
  const result = await seedDemo();
  console.log("Presentation data ready:", result);
} catch (error) {
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
