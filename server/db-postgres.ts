import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { runtimeConfig } from "./config/runtime";
import { buildPgSslPoolConfig } from "./config/database-ssl";
import {
  bindPgPoolHealthCheck,
  bindPgPoolMonitoring,
} from "./db-pool-monitor";
import {
  bindReadReplicaHealthCheck,
  configureReadReplicaHealth,
  createReadReplicaFallbackPool,
  getReadReplicaHealthSnapshot,
} from "./db-read-replica";
import { buildPgRuntimePoolOptions } from "./db-postgres-options";

const { Pool } = pg;
const pgSslPoolConfig = buildPgSslPoolConfig(runtimeConfig.database.ssl);
const pgRuntimePoolOptions = buildPgRuntimePoolOptions({
  searchPath: runtimeConfig.database.searchPath,
  statementTimeoutMs: runtimeConfig.database.statementTimeoutMs,
});

function buildPrimaryPoolConfig() {
  return runtimeConfig.database.connectionString
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
      };
}

function buildReplicaPoolConfig() {
  if (!runtimeConfig.database.replicaConnectionString) {
    return null;
  }

  return {
    connectionString: runtimeConfig.database.replicaConnectionString,
    max: runtimeConfig.database.maxConnections,
    idleTimeoutMillis: runtimeConfig.database.idleTimeoutMs,
    connectionTimeoutMillis: runtimeConfig.database.connectionTimeoutMs,
    options: pgRuntimePoolOptions,
    ...pgSslPoolConfig,
  };
}

export const pool = new Pool(buildPrimaryPoolConfig());
export const readReplicaPool = (() => {
  const config = buildReplicaPoolConfig();
  return config ? new Pool(config) : null;
})();
configureReadReplicaHealth(Boolean(readReplicaPool));
const readPool = readReplicaPool
  ? createReadReplicaFallbackPool(pool, readReplicaPool)
  : pool;

const stopPgPoolMonitoring = bindPgPoolMonitoring(pool, {
  warnCooldownMs: runtimeConfig.runtime.pgPoolWarnCooldownMs,
});
const stopPgPoolHealthCheck = bindPgPoolHealthCheck(pool, {
  intervalMs: 60_000,
  timeoutMs: Math.max(1_000, runtimeConfig.database.connectionTimeoutMs),
});
const stopReadReplicaHealthCheck = bindReadReplicaHealthCheck(readReplicaPool, {
  intervalMs: 60_000,
  timeoutMs: Math.max(1_000, runtimeConfig.database.connectionTimeoutMs),
});

export function stopPgPoolBackgroundTasks() {
  stopPgPoolMonitoring();
  stopPgPoolHealthCheck();
  stopReadReplicaHealthCheck();
}

export const db = drizzle(pool);
export const dbRead = readReplicaPool ? drizzle(readPool) : db;
export { getReadReplicaHealthSnapshot };

export async function closePostgresPools() {
  await Promise.all([
    pool.end(),
    readReplicaPool ? readReplicaPool.end() : Promise.resolve(),
  ]);
}
