import assert from "node:assert/strict";
import test from "node:test";

import {
  getIntelligenceFailSafeLogStateSizeForTests,
  INTELLIGENCE_FAILSAFE_LOG_MAX_KEYS,
  INTELLIGENCE_FAILSAFE_LOG_STALE_MS,
  logIntelligenceFailSafe,
  pruneIntelligenceFailSafeLogState,
  resetIntelligenceFailSafeLogStateForTests,
} from "../intelligence-failsafe-logger";
import { logger } from "../../lib/logger";

test("intelligence fail-safe logging emits operation metadata without spamming", (t) => {
  resetIntelligenceFailSafeLogStateForTests();
  const warningLogs: Array<{ message: string; payload: Record<string, unknown> }> = [];
  t.mock.method(logger, "warn", (message: string, payload: Record<string, unknown>) => {
    warningLogs.push({ message, payload });
  });

  const error = new Error("engine failed");

  assert.equal(
    logIntelligenceFailSafe({
      engine: "CorrelationEngine",
      operation: "safeCorrelation",
      error,
      nowMs: 1_000,
    }),
    true,
  );
  assert.equal(
    logIntelligenceFailSafe({
      engine: "CorrelationEngine",
      operation: "safeCorrelation",
      error,
      nowMs: 1_500,
    }),
    false,
  );
  assert.equal(
    logIntelligenceFailSafe({
      engine: "CorrelationEngine",
      operation: "safeCorrelation",
      error,
      nowMs: 62_000,
    }),
    true,
  );

  assert.equal(warningLogs.length, 2);
  assert.equal(warningLogs[0].message, "Intelligence engine entered fail-safe path");
  assert.deepEqual(
    {
      engine: warningLogs[0].payload.engine,
      operation: warningLogs[0].payload.operation,
      error: warningLogs[0].payload.error,
    },
    {
      engine: "CorrelationEngine",
      operation: "safeCorrelation",
      error,
    },
  );
});

test("intelligence fail-safe logging bounds per-key cooldown state", (t) => {
  resetIntelligenceFailSafeLogStateForTests();
  t.mock.method(logger, "warn", () => undefined);

  for (let index = 0; index < INTELLIGENCE_FAILSAFE_LOG_MAX_KEYS + 24; index += 1) {
    assert.equal(
      logIntelligenceFailSafe({
        engine: "CorrelationEngine",
        operation: `operation-${index}`,
        error: new Error("engine failed"),
        nowMs: 10_000 + index,
      }),
      true,
    );
  }

  assert.equal(getIntelligenceFailSafeLogStateSizeForTests(), INTELLIGENCE_FAILSAFE_LOG_MAX_KEYS);
});

test("intelligence fail-safe logging prunes stale cooldown state", (t) => {
  resetIntelligenceFailSafeLogStateForTests();
  t.mock.method(logger, "warn", () => undefined);

  assert.equal(
    logIntelligenceFailSafe({
      engine: "CorrelationEngine",
      operation: "safeCorrelation",
      error: new Error("engine failed"),
      nowMs: 5_000,
    }),
    true,
  );
  assert.equal(getIntelligenceFailSafeLogStateSizeForTests(), 1);

  assert.equal(pruneIntelligenceFailSafeLogState(5_000 + INTELLIGENCE_FAILSAFE_LOG_STALE_MS), 0);
  assert.equal(getIntelligenceFailSafeLogStateSizeForTests(), 0);
});
