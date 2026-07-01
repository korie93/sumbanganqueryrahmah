import "dotenv/config";
import { readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

function readInt(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const databaseSslCaFile = String(process.env.DATABASE_SSL_CA_FILE || "").trim();
const dbSslCredentials = databaseSslCaFile
  ? {
    ssl: {
      ca: readFileSync(databaseSslCaFile, "utf8"),
      rejectUnauthorized: true,
    },
  }
  : {};
const dbCredentials = databaseUrl
  ? { url: databaseUrl, ...dbSslCredentials }
  : {
    host: process.env.PG_HOST ?? "localhost",
    port: readInt("PG_PORT", 5432),
    user: process.env.PG_USER ?? "postgres",
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE ?? "sqr_db",
    ...dbSslCredentials,
  };

export default defineConfig({
  dialect: "postgresql",
  schema: "./shared/schema-postgres.ts",
  out: "./drizzle",
  dbCredentials,
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
  },
  strict: true,
  verbose: true,
});
