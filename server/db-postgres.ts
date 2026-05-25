import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { runtimeConfig } from "./config/runtime";
import { buildPgSslPoolConfig } from "./config/database-ssl";
import {
  bindPgPoolHealthCheck,
  bindPgPoolMonitoring,
} from "./db-pool-monitor";
import { buildPgRuntimePoolOptions } from "./db-postgres-options";

const { Pool } = pg;
const pgSslPoolConfig = buildPgSslPoolConfig(runtimeConfig.database.ssl);
const pgRuntimePoolOptions = buildPgRuntimePoolOptions({
  searchPath: runtimeConfig.database.searchPath,
  statementTimeoutMs: runtimeConfig.database.statementTimeoutMs,
});

export const pool = new Pool(
  runtimeConfig.database.connectionString
    ? {
        connectionString: runtimeConfig.database.connectionString,
        max: runtimeConfig.database.maxConnections,
        idleTimeoutMillis: runtimeConfig.database.idleTimeoutMs,
        connectionTimeoutMillis: runtimeConfig.database.connectionTimeoutMs,
        options: pgRuntimePoolOptions,
        ...pgSslPoolConfig,
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
        options: pgRuntimePoolOptions,
        ...pgSslPoolConfig,
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
