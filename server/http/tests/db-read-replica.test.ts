import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import {
  bindReadReplicaHealthCheck,
  configureReadReplicaHealth,
  createReadReplicaFallbackPool,
  getReadReplicaHealthSnapshot,
} from "../../db-read-replica";
import type { InternalMetricName } from "../../internal/metrics";

type QueryHandler = (...args: unknown[]) => Promise<unknown>;

function createPool(handler: QueryHandler): Pool {
  return {
    query: ((...args: unknown[]) => handler(...args)) as Pool["query"],
  } as Pool;
}

function createMetricsRecorder() {
  const increments = new Map<InternalMetricName, number>();
  return {
    increments,
    metrics: {
      increment(name: InternalMetricName, amount = 1) {
        increments.set(name, (increments.get(name) ?? 0) + amount);
      },
    },
  };
}

function createWarningSink() {
  const warnings: Array<{ message: string; meta: unknown }> = [];
  return {
    logger: {
      warn(message: string, meta: unknown) {
        warnings.push({ message, meta });
      },
    },
    warnings,
  };
}

test("read replica fallback pool routes successful reads to the replica", async () => {
  configureReadReplicaHealth(true);
  let replicaQueries = 0;
  let primaryQueries = 0;

  const primaryPool = createPool(async () => {
    primaryQueries += 1;
    return { rows: [{ source: "primary" }] };
  });
  const replicaPool = createPool(async () => {
    replicaQueries += 1;
    return { rows: [{ source: "replica" }] };
  });

  const readPool = createReadReplicaFallbackPool(primaryPool, replicaPool);
  const result = await readPool.query("SELECT 1");

  assert.deepEqual(result, { rows: [{ source: "replica" }] });
  assert.equal(replicaQueries, 1);
  assert.equal(primaryQueries, 0);
  assert.deepEqual(getReadReplicaHealthSnapshot(), {
    configured: true,
    fallbackCount: 0,
    lastErrorAt: null,
    lastErrorCode: null,
    state: "healthy",
  });
});

test("read replica fallback pool falls back to primary and records sanitized health when replica fails", async () => {
  configureReadReplicaHealth(true);
  const { increments, metrics } = createMetricsRecorder();
  const { logger, warnings } = createWarningSink();
  const now = new Date("2026-06-03T00:00:00.000Z");
  const primaryArgs: unknown[][] = [];
  const failure = Object.assign(
    new Error("connection failed for postgres://replica:secret@db.internal/sqr"),
    { code: "ECONNRESET" },
  );

  const primaryPool = createPool(async (...args) => {
    primaryArgs.push(args);
    return { rows: [{ source: "primary" }] };
  });
  const replicaPool = createPool(async () => {
    throw failure;
  });

  const readPool = createReadReplicaFallbackPool(primaryPool, replicaPool, {
    logger,
    metrics,
    now: () => now,
    warningCooldownMs: 1_000,
  });
  const result = await readPool.query("SELECT $1", ["value"]);

  assert.deepEqual(result, { rows: [{ source: "primary" }] });
  assert.deepEqual(primaryArgs, [["SELECT $1", ["value"]]]);
  assert.equal(increments.get("dbReadReplicaFallbacksTotal"), 1);
  assert.deepEqual(getReadReplicaHealthSnapshot(), {
    configured: true,
    fallbackCount: 1,
    lastErrorAt: now.toISOString(),
    lastErrorCode: "ECONNRESET",
    state: "degraded",
  });

  const warningText = JSON.stringify(warnings);
  assert.match(warningText, /db_read_replica_fallback/);
  assert.doesNotMatch(warningText, /secret|postgres:\/\/replica/i);
});

test("read replica health check marks replica degraded without counting a read fallback", async () => {
  configureReadReplicaHealth(true);
  const { increments, metrics } = createMetricsRecorder();
  const { logger } = createWarningSink();
  const now = new Date("2026-06-03T00:01:00.000Z");
  const replicaPool = createPool(async () => {
    throw Object.assign(new Error("health check failed"), { code: "ETIMEDOUT" });
  });

  const stop = bindReadReplicaHealthCheck(replicaPool, {
    intervalMs: 1_000,
    logger,
    metrics,
    now: () => now,
    timeoutMs: 250,
    warningCooldownMs: 1_000,
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  stop();

  assert.equal(increments.get("dbReadReplicaHealthCheckFailuresTotal"), 1);
  assert.deepEqual(getReadReplicaHealthSnapshot(), {
    configured: true,
    fallbackCount: 0,
    lastErrorAt: now.toISOString(),
    lastErrorCode: "ETIMEDOUT",
    state: "degraded",
  });
});

test("read replica health check suppresses late failures after stop", async () => {
  configureReadReplicaHealth(true);
  const { increments, metrics } = createMetricsRecorder();
  const { logger, warnings } = createWarningSink();
  const queryState: { reject: ((reason?: unknown) => void) | null } = { reject: null };
  let queryCalls = 0;
  const replicaPool = createPool(() => {
    queryCalls += 1;
    return new Promise((_resolve, reject) => {
      queryState.reject = reject;
    });
  });

  const stop = bindReadReplicaHealthCheck(replicaPool, {
    intervalMs: 1_000,
    logger,
    metrics,
    timeoutMs: 1_000,
    warningCooldownMs: 1_000,
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queryCalls, 1);
  stop();
  queryState.reject?.(Object.assign(new Error("replica stopped"), { code: "ECONNRESET" }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(increments.get("dbReadReplicaHealthCheckFailuresTotal"), undefined);
  assert.equal(warnings.length, 0);
  assert.deepEqual(getReadReplicaHealthSnapshot(), {
    configured: true,
    fallbackCount: 0,
    lastErrorAt: null,
    lastErrorCode: null,
    state: "healthy",
  });
});

