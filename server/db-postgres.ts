import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { readDatabasePassword } from "./config/security";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres",
  password: readDatabasePassword(),
  database: process.env.PG_DATABASE || "sqr_db",
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  options: "-c search_path=public",
});

export const db = drizzle(pool);
