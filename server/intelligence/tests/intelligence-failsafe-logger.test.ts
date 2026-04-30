import assert from "node:assert/strict";
import test from "node:test";

import {
  logIntelligenceFailSafe,
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
