import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { withPostgresMigrationAdvisoryLock } from "./lib/postgres-migration-lock.mjs";
import { buildPostgresPoolConfig } from "./lib/postgres-preflight.mjs";

const pool = new pg.Pool(buildPostgresPoolConfig(process.env, { max: 2 }));

try {
  await withPostgresMigrationAdvisoryLock(pool, async () => {
    console.log("Applying Drizzle migrations...");

    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: "./drizzle",
      migrationsTable: "__drizzle_migrations",
      migrationsSchema: "public",
    });
  });

  console.log("Drizzle migrations applied successfully.");
} catch (error) {
  console.error("Failed to apply Drizzle migrations:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
