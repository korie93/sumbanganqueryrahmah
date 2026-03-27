import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveRuntimeMonitorTaskIntervalMs,
  shouldRunRuntimeMonitorTask,
} from "../../internal/runtime-monitor-cadence";

test("resolveRuntimeMonitorTaskIntervalMs uses longer background intervals in low-memory mode", () => {
  assert.equal(
    resolveRuntimeMonitorTaskIntervalMs("rollupRefreshSnapshot", { lowMemoryMode: true }),
    30_000,
  );
  assert.equal(
    resolveRuntimeMonitorTaskIntervalMs("alertHistorySync", { lowMemoryMode: true }),
    60_000,
  );
  assert.equal(
    resolveRuntimeMonitorTaskIntervalMs("intelligenceEvaluation", { lowMemoryMode: true }),
    30_000,
  );
});

test("shouldRunRuntimeMonitorTask only runs after the interval has elapsed", () => {
  assert.equal(
    shouldRunRuntimeMonitorTask({
      lastRunAt: 1_000,
      now: 20_000,
      intervalMs: 30_000,
    }),
    false,
  );

  assert.equal(
    shouldRunRuntimeMonitorTask({
      lastRunAt: 1_000,
      now: 32_000,
      intervalMs: 30_000,
    }),
    true,
  );
});

test("shouldRunRuntimeMonitorTask always allows the first run and explicit force", () => {
  assert.equal(
    shouldRunRuntimeMonitorTask({
      lastRunAt: 0,
      now: 5_000,
      intervalMs: 60_000,
    }),
    true,
  );

  assert.equal(
    shouldRunRuntimeMonitorTask({
      lastRunAt: 10_000,
      now: 15_000,
      intervalMs: 60_000,
      force: true,
    }),
    true,
  );
});
