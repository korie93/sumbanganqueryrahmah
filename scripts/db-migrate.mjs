import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

function readInt(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

const pool = new pg.Pool({
  host: process.env.PG_HOST ?? "localhost",
  port: readInt("PG_PORT", 5432),
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE ?? "sqr_db",
});

try {
  console.log("Applying Drizzle migrations...");

  const db = drizzle(pool);
  await migrate(db, {
    migrationsFolder: "./drizzle",
    migrationsTable: "__drizzle_migrations",
    migrationsSchema: "public",
  });

  console.log("Drizzle migrations applied successfully.");
} catch (error) {
  console.error("Failed to apply Drizzle migrations:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
