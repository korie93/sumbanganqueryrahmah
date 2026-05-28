import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createBackgroundSweepJob } from "../background-sweep-job";

function installIntervalMocks(t: TestContext) {
  const fakeHandle = {
    unrefCalled: false,
    unref() {
      this.unrefCalled = true;
      return this;
    },
  };
  let capturedHandler: TimerHandler | null = null;
  const setIntervalMock = t.mock.method(
    globalThis,
    "setInterval",
    (((handler: TimerHandler) => {
      capturedHandler = handler;
      return fakeHandle as unknown as ReturnType<typeof setInterval>;
    }) as unknown) as typeof setInterval,
  );
  const clearIntervalMock = t.mock.method(
    globalThis,
    "clearInterval",
    (((handle?: ReturnType<typeof setInterval>) => {
      assert.equal(handle, fakeHandle as unknown as ReturnType<typeof setInterval>);
    }) as unknown) as typeof clearInterval,
  );

  return {
    clearIntervalMock,
    fakeHandle,
    getCapturedHandler: () => capturedHandler,
    setIntervalMock,
  };
}

test("background sweep job coalesces overlapping triggers into one pending run", async (t) => {
  installIntervalMocks(t);
  const runs: number[] = [];
  let releaseFirstRun: () => void = () => {
    throw new Error("First background sweep release was not initialized");
  };
  const firstRunReleased = new Promise<void>((resolve) => {
    releaseFirstRun = resolve;
  });
  const job = createBackgroundSweepJob({
    failureMessage: "test sweep failed",
    intervalMs: 1_000,
    logger: {
      warn() {
        throw new Error("background sweep test did not expect warning logs");
      },
    },
    run: async (now) => {
      runs.push(now);
      if (runs.length === 1) {
        await firstRunReleased;
      }
    },
  });

  const firstTrigger = job.trigger(1);
  await Promise.resolve();
  await job.trigger(2);
  await job.trigger(3);
  assert.deepEqual(runs, [1]);

  releaseFirstRun();
  await firstTrigger;

  assert.deepEqual(runs, [1, 3]);
  assert.deepEqual(job.getStats(), {
    completedRuns: 2,
    failedRuns: 0,
    pendingRuns: 1,
    skippedRuns: 2,
  });

  job.stop();
});

test("background sweep job logs failures and stops its interval idempotently", async (t) => {
  const intervalMocks = installIntervalMocks(t);
  const warnings: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  const job = createBackgroundSweepJob({
    failureMessage: "test sweep failed",
    intervalMs: 1_000,
    logger: {
      warn(message: string, payload?: Record<string, unknown>) {
        warnings.push({ message, payload });
      },
    },
    run: () => {
      throw new Error("synthetic sweep failure");
    },
  });

  assert.equal(intervalMocks.setIntervalMock.mock.callCount(), 1);
  assert.equal(intervalMocks.fakeHandle.unrefCalled, true);
  assert.equal(typeof intervalMocks.getCapturedHandler(), "function");

  await job.trigger(1);
  assert.deepEqual(job.getStats(), {
    completedRuns: 0,
    failedRuns: 1,
    pendingRuns: 0,
    skippedRuns: 0,
  });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, "test sweep failed");
  assert.equal(warnings[0]?.payload?.error, "synthetic sweep failure");

  job.stop();
  job.stop();
  assert.equal(intervalMocks.clearIntervalMock.mock.callCount(), 1);
  assert.equal(job.isActive(), false);
});
