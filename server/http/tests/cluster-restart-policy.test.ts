import assert from "node:assert/strict";
import test from "node:test";
import {
  planClusterSpawnAttempt,
  recordUnexpectedWorkerExit,
  shouldRestoreMinimumClusterCapacity,
} from "../../internal/cluster-restart-policy";

test("recordUnexpectedWorkerExit trips restart blocking only after the configured crash-loop threshold", () => {
  const now = 1_710_000_000_000;
  const outcome = recordUnexpectedWorkerExit({
    now,
    unexpectedExitTimestamps: [
      now - 50_000,
      now - 40_000,
      now - 30_000,
      now - 20_000,
      now - 10_000,
    ],
    restartFailureWindowMs: 60_000,
    maxRestartAttempts: 5,
    restartBlockMs: 60_000,
  });

  assert.equal(outcome.shouldBlockRestarts, true);
  assert.equal(outcome.restartBlockedUntil, now + 60_000);
  assert.equal(outcome.nextUnexpectedExitTimestamps.length, 6);
});

test("planClusterSpawnAttempt preserves throttle timing for replacement workers", () => {
  const throttled = planClusterSpawnAttempt({
    now: 10_000,
    lastSpawnAttemptTime: 9_000,
    restartThrottleMs: 2_000,
  });
  const ready = planClusterSpawnAttempt({
    now: 12_500,
    lastSpawnAttemptTime: 9_000,
    restartThrottleMs: 2_000,
  });

  assert.equal(throttled.shouldSpawn, false);
  assert.equal(throttled.remainingDelayMs, 1_000);
  assert.equal(ready.shouldSpawn, true);
  assert.equal(ready.nextLastSpawnAttemptTime, 12_500);
});

test("shouldRestoreMinimumClusterCapacity respects fatal locks and restart blocks", () => {
  assert.equal(
    shouldRestoreMinimumClusterCapacity({
      fatalStartupLockReason: "EADDRINUSE",
      restartBlockedUntil: 0,
      now: 10_000,
      workerCount: 0,
      minWorkers: 1,
    }),
    false,
  );

  assert.equal(
    shouldRestoreMinimumClusterCapacity({
      fatalStartupLockReason: null,
      restartBlockedUntil: 15_000,
      now: 10_000,
      workerCount: 0,
      minWorkers: 1,
    }),
    false,
  );

  assert.equal(
    shouldRestoreMinimumClusterCapacity({
      fatalStartupLockReason: null,
      restartBlockedUntil: 9_000,
      now: 10_000,
      workerCount: 0,
      minWorkers: 1,
    }),
    true,
  );
});
