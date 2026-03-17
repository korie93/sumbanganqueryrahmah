import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { runtimeConfig } from "./config/runtime";

const { Pool } = pg;

function validateSearchPath(searchPath: string): string {
  if (!/^[a-zA-Z0-9_,\s]+$/.test(searchPath)) {
    throw new Error(`Invalid PG search_path: "${searchPath}"`);
  }
  return searchPath;
}

export const pool = new Pool({
  host: runtimeConfig.database.host,
  port: runtimeConfig.database.port,
  user: runtimeConfig.database.user,
  password: runtimeConfig.database.password,
  database: runtimeConfig.database.database,
  max: runtimeConfig.database.maxConnections,
  idleTimeoutMillis: runtimeConfig.database.idleTimeoutMs,
  connectionTimeoutMillis: runtimeConfig.database.connectionTimeoutMs,
  options: `-c search_path=${validateSearchPath(runtimeConfig.database.searchPath)}`,
});

export const db = drizzle(pool);
