import "dotenv/config";
import { defineConfig } from "drizzle-kit";

function readInt(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./shared/schema-postgres.ts",
  out: "./drizzle",
  dbCredentials: {
    host: process.env.PG_HOST ?? "localhost",
    port: readInt("PG_PORT", 5432),
    user: process.env.PG_USER ?? "postgres",
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE ?? "sqr_db",
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
  },
  strict: true,
  verbose: true,
});
