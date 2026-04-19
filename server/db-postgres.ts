import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { runtimeConfig } from "./config/runtime";
import { validatePgSearchPath } from "./config/db-search-path";
import {
  bindPgPoolHealthCheck,
  bindPgPoolMonitoring,
} from "./db-pool-monitor";
import { createDbQueryProfiler } from "./lib/db-query-profiler";
import { logger } from "./lib/logger";

const { Pool } = pg;

export function buildPgPoolConfig(config: typeof runtimeConfig.database): pg.PoolConfig {
  const sharedConfig = {
    max: config.maxConnections,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    query_timeout: config.queryTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    options: `-c search_path=${validatePgSearchPath(config.searchPath)}`,
  } satisfies pg.PoolConfig;

  return config.connectionString
    ? {
        ...sharedConfig,
        connectionString: config.connectionString,
      }
    : {
        ...sharedConfig,
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
      };
}

export const pool = new Pool(buildPgPoolConfig(runtimeConfig.database));

export const dbQueryProfiler = createDbQueryProfiler({
  ...runtimeConfig.runtime.dbQueryProfiling,
  logger,
});

dbQueryProfiler.instrumentPgPool(pool);

const stopPgPoolMonitoring = bindPgPoolMonitoring(pool, {
  warnCooldownMs: runtimeConfig.runtime.pgPoolWarnCooldownMs,
  minWaitingCount: runtimeConfig.runtime.pgPoolAlertWaitingCount,
  minUtilizationPercent: runtimeConfig.runtime.pgPoolAlertUtilizationPercent,
});
const stopPgPoolHealthCheck = bindPgPoolHealthCheck(pool, {
  intervalMs: runtimeConfig.runtime.pgPoolHealthCheckIntervalMs,
  timeoutMs: Math.min(
    runtimeConfig.runtime.pgPoolHealthCheckIntervalMs,
    Math.max(250, runtimeConfig.runtime.pgPoolHealthCheckTimeoutMs),
  ),
});

export function stopPgPoolBackgroundTasks() {
  stopPgPoolMonitoring();
  stopPgPoolHealthCheck();
}

export const db = drizzle(pool);
