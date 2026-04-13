import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { runtimeConfig } from "./config/runtime";
import { validatePgSearchPath } from "./config/db-search-path";
import {
  bindPgPoolHealthCheck,
  bindPgPoolMonitoring,
} from "./db-pool-monitor";

const { Pool } = pg;

export const pool = new Pool(
  runtimeConfig.database.connectionString
    ? {
        connectionString: runtimeConfig.database.connectionString,
        max: runtimeConfig.database.maxConnections,
        idleTimeoutMillis: runtimeConfig.database.idleTimeoutMs,
        connectionTimeoutMillis: runtimeConfig.database.connectionTimeoutMs,
        options: `-c search_path=${validatePgSearchPath(runtimeConfig.database.searchPath)}`,
      }
    : {
        host: runtimeConfig.database.host,
        port: runtimeConfig.database.port,
        user: runtimeConfig.database.user,
        password: runtimeConfig.database.password,
        database: runtimeConfig.database.database,
        max: runtimeConfig.database.maxConnections,
        idleTimeoutMillis: runtimeConfig.database.idleTimeoutMs,
        connectionTimeoutMillis: runtimeConfig.database.connectionTimeoutMs,
        options: `-c search_path=${validatePgSearchPath(runtimeConfig.database.searchPath)}`,
      },
);

const stopPgPoolMonitoring = bindPgPoolMonitoring(pool, {
  warnCooldownMs: runtimeConfig.runtime.pgPoolWarnCooldownMs,
});
const stopPgPoolHealthCheck = bindPgPoolHealthCheck(pool, {
  intervalMs: 60_000,
  timeoutMs: Math.max(1_000, runtimeConfig.database.connectionTimeoutMs),
});

export function stopPgPoolBackgroundTasks() {
  stopPgPoolMonitoring();
  stopPgPoolHealthCheck();
}

export const db = drizzle(pool);
