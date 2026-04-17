import assert from "node:assert/strict";
import test from "node:test";
import {
  createDbQueryProfiler,
  instrumentPgClientQueryMethod,
  normalizeDbQueryProfileStatement,
  shouldSampleDbQueryProfile,
} from "../lib/db-query-profiler";

test("normalizeDbQueryProfileStatement groups literals, parameters, and whitespace", () => {
  const normalized = normalizeDbQueryProfileStatement(`
    /* comment */
    SELECT * FROM users
    WHERE id = $1
      AND username = 'admin.user'
      AND attempts > 5
  `);

  assert.equal(
    normalized,
    "SELECT * FROM users WHERE id = ? AND username = ? AND attempts > ?",
  );
});

test("shouldSampleDbQueryProfile respects zero, full, and partial sample rates", () => {
  assert.equal(shouldSampleDbQueryProfile(0, 0), false);
  assert.equal(shouldSampleDbQueryProfile(100, 0.999), true);
  assert.equal(shouldSampleDbQueryProfile(25, 0.2), true);
  assert.equal(shouldSampleDbQueryProfile(25, 0.3), false);
});

test("instrumentPgClientQueryMethod records promise-based query completions exactly once", async () => {
  const samples: Array<{ durationMs: number; sqlText: string }> = [];
  const clientPrototype = {
    query(...args: unknown[]) {
      const sqlText = String(args[0] || "");
      return Promise.resolve({ sqlText });
    },
  };

  const cleanup = instrumentPgClientQueryMethod(clientPrototype, (sqlText, durationMs) => {
    samples.push({ sqlText, durationMs });
  });

  await clientPrototype.query("SELECT 1");

  assert.equal(samples.length, 1);
  assert.equal(samples[0]?.sqlText, "SELECT 1");
  assert.equal(typeof samples[0]?.durationMs, "number");

  cleanup();
});

test("createDbQueryProfiler logs repeated statements as a possible N+1 signal", async () => {
  const warnings: Array<{ message: string; meta: Record<string, unknown> | undefined }> = [];
  const profiler = createDbQueryProfiler({
    enabled: true,
    samplePercent: 100,
    minQueryCount: 3,
    minTotalQueryMs: 0,
    repeatedStatementThreshold: 2,
    maxLoggedStatements: 5,
    maxUniqueStatements: 50,
    random: () => 0,
    logger: {
      warn(message, meta) {
        warnings.push({ message, meta });
      },
    },
  });
  const clientPrototype = {
    query(...args: unknown[]) {
      const sqlText = String(args[0] || "");
      return Promise.resolve({ sqlText });
    },
  };

  const cleanup = profiler.instrumentPgClientQueryMethod(clientPrototype);

  await profiler.runWithRequestProfiling({
    requestId: "req-1",
    method: "GET",
    path: "/api/collection/summary",
  }, async () => {
    await clientPrototype.query("SELECT * FROM users WHERE id = $1");
    await clientPrototype.query("SELECT * FROM users WHERE id = $1");
    await clientPrototype.query("SELECT * FROM users WHERE id = $1");
    profiler.flushRequestProfile(200, 12.5);
  });

  cleanup();

  assert.equal(warnings.length, 1);
  assert.match(warnings[0]?.message || "", /possible N\+1/i);
  assert.equal(warnings[0]?.meta?.possibleNPlusOne, true);
  assert.equal(warnings[0]?.meta?.queryCount, 3);
  assert.equal(warnings[0]?.meta?.uniqueStatementCount, 1);
  assert.equal(Array.isArray(warnings[0]?.meta?.repeatedStatements), true);
  assert.equal(
    (warnings[0]?.meta?.repeatedStatements as Array<{ count: number }>)[0]?.count,
    3,
  );
});

test("createDbQueryProfiler stays silent when profiling is disabled", async () => {
  let warningCount = 0;
  const profiler = createDbQueryProfiler({
    enabled: false,
    samplePercent: 100,
    minQueryCount: 1,
    minTotalQueryMs: 0,
    repeatedStatementThreshold: 2,
    maxLoggedStatements: 5,
    maxUniqueStatements: 50,
    logger: {
      warn() {
        warningCount += 1;
      },
    },
  });
  const clientPrototype = {
    query(...args: unknown[]) {
      const sqlText = String(args[0] || "");
      return Promise.resolve({ sqlText });
    },
  };

  profiler.instrumentPgClientQueryMethod(clientPrototype);

  await profiler.runWithRequestProfiling({
    requestId: "req-disabled",
    method: "GET",
    path: "/api/health/ready",
  }, async () => {
    await clientPrototype.query("SELECT 1");
    profiler.flushRequestProfile(200, 1.5);
  });

  assert.equal(warningCount, 0);
});

test("createDbQueryProfiler evicts the oldest tracked statements when a profiled request exceeds the unique statement cap", async () => {
  const warnings: Array<Record<string, unknown> | undefined> = [];
  const profiler = createDbQueryProfiler({
    enabled: true,
    samplePercent: 100,
    minQueryCount: 1,
    minTotalQueryMs: 0,
    repeatedStatementThreshold: 10,
    maxLoggedStatements: 5,
    maxUniqueStatements: 10,
    random: () => 0,
    logger: {
      warn(_message, meta) {
        warnings.push(meta);
      },
    },
  });
  const clientPrototype = {
    query(...args: unknown[]) {
      const sqlText = String(args[0] || "");
      return Promise.resolve({ sqlText });
    },
  };

  const cleanup = profiler.instrumentPgClientQueryMethod(clientPrototype);

  await profiler.runWithRequestProfiling({
    requestId: "req-lru",
    method: "GET",
    path: "/api/debug/sql",
  }, async () => {
    for (let index = 1; index <= 11; index += 1) {
      await clientPrototype.query(`SELECT id FROM lru_test_table_${index}`);
    }
    profiler.flushRequestProfile(200, 4.2);
  });

  cleanup();

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.queryCount, 11);
  assert.equal(warnings[0]?.uniqueStatementCount, 10);
  assert.equal(warnings[0]?.evictedStatementCount, 1);
});
