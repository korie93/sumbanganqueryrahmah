import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  ACTIVITY_RETENTION_SWEEP_INTERVAL_MS,
  startActivityRetentionJob,
} from "../activity-retention-job";

function installIntervalMocks(t: TestContext) {
  const fakeHandle = {
    unrefCalled: false,
    unref() {
      this.unrefCalled = true;
      return this;
    },
  };
  let intervalMs = 0;
  const setIntervalMock = t.mock.method(
    globalThis,
    "setInterval",
    (((_handler: TimerHandler, delay?: number) => {
      intervalMs = Number(delay);
      return fakeHandle as unknown as ReturnType<typeof setInterval>;
    }) as unknown) as typeof setInterval,
  );
  const clearIntervalMock = t.mock.method(
    globalThis,
    "clearInterval",
    (() => undefined) as typeof clearInterval,
  );

  return {
    clearIntervalMock,
    fakeHandle,
    getIntervalMs: () => intervalMs,
    setIntervalMock,
  };
}

test("activity retention job schedules bounded sweeps and stops without leaking its interval", async (t) => {
  const intervalMocks = installIntervalMocks(t);
  const runAt: Date[] = [];
  const job = startActivityRetentionJob({
    runCleanup: async (now) => {
      runAt.push(now);
    },
  });

  assert.equal(intervalMocks.setIntervalMock.mock.callCount(), 1);
  assert.equal(intervalMocks.getIntervalMs(), ACTIVITY_RETENTION_SWEEP_INTERVAL_MS);
  assert.equal(intervalMocks.fakeHandle.unrefCalled, true);

  await job.trigger(Date.parse("2026-06-12T00:00:00.000Z"));
  assert.deepEqual(runAt, [new Date("2026-06-12T00:00:00.000Z")]);

  job.stop();
  job.stop();
  assert.equal(intervalMocks.clearIntervalMock.mock.callCount(), 1);
  assert.equal(job.isActive(), false);
});
