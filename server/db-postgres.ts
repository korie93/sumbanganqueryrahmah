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
  const pgOptions = [
    `-c search_path=${validatePgSearchPath(config.searchPath)}`,
    `-c statement_timeout=${Math.max(1, Math.trunc(config.statementTimeoutMs))}`,
  ].join(" ");

  const sharedConfig = {
    max: config.maxConnections,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    query_timeout: config.queryTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    options: pgOptions,
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

const stopDbQueryProfiler = dbQueryProfiler.instrumentPgPool(pool);

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
  stopDbQueryProfiler?.();
  stopPgPoolMonitoring();
  stopPgPoolHealthCheck();
}

export const db = drizzle(pool);
