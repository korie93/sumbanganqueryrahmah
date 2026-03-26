import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { runtimeConfig } from "./config/runtime";
import { bindPgPoolMonitoring } from "./db-pool-monitor";

const { Pool } = pg;

function validateSearchPath(searchPath: string): string {
  // Each schema name is either:
  //   - a bare identifier:   $user, public, pg_catalog
  //   - a quoted identifier: "my schema"
  // Names are separated by commas with optional whitespace.
  const schemaName = String.raw`\$?[a-zA-Z_][a-zA-Z0-9_]*|"[^"]*"`;
  const pattern = new RegExp(`^(${schemaName})(,\\s*(${schemaName}))*$`);
  if (!pattern.test(searchPath)) {
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

bindPgPoolMonitoring(pool, {
  warnCooldownMs: runtimeConfig.runtime.pgPoolWarnCooldownMs,
});

export const db = drizzle(pool);
