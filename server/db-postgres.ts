import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "Postgres@123",
  database: process.env.PG_DATABASE || "sqr_db",
  options: "-c search_path=public",
});

export const db = drizzle(pool);
