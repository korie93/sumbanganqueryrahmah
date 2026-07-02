import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { logger } from "../../lib/logger";
import { startBackgroundServiceWithHealthSignal } from "../background-service-health";
import {
  clearStartupServiceDegraded,
  getStartupHealthSnapshot,
  markStartupServiceDegraded,
} from "../startup-health";

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

test("startBackgroundServiceWithHealthSignal marks startup health degraded on start failure", async (t) => {
  const service = "backup-job-queue";
  clearStartupServiceDegraded(service);
  const errorMock = t.mock.method(logger, "error", () => undefined);

  try {
    const handle = startBackgroundServiceWithHealthSignal({
      service,
      failureReason: "BACKUP_JOB_QUEUE_START_FAILED",
      failureDetails: "Backup background job queue failed to start; see server logs.",
      failureLogMessage: "Failed to start backup background job queue",
      retryDelayMs: 60_000,
      start: async () => {
        throw new Error("queue bootstrap failed");
      },
    });
    t.after(() => handle.stop());

    await flushAsyncWork();

    const snapshot = getStartupHealthSnapshot();
    assert.equal(snapshot.degraded, true);
    assert.deepEqual(snapshot.degradedServices.map((entry) => entry.service), [service]);
    assert.equal(snapshot.degradedServices[0].reason, "BACKUP_JOB_QUEUE_START_FAILED");
    assert.equal(errorMock.mock.callCount(), 1);
  } finally {
    clearStartupServiceDegraded(service);
  }
});

test("startBackgroundServiceWithHealthSignal clears stale degraded state on successful start", async (t) => {
  const service = "backup-job-queue";
  markStartupServiceDegraded(service, "BACKUP_JOB_QUEUE_START_FAILED", "Previous failure.");

  try {
    const handle = startBackgroundServiceWithHealthSignal({
      service,
      failureReason: "BACKUP_JOB_QUEUE_START_FAILED",
      failureDetails: "Backup background job queue failed to start; see server logs.",
      failureLogMessage: "Failed to start backup background job queue",
      start: async () => undefined,
    });
    t.after(() => handle.stop());

    await flushAsyncWork();

    const snapshot = getStartupHealthSnapshot();
    assert.equal(snapshot.degradedServices.some((entry) => entry.service === service), false);
  } finally {
    clearStartupServiceDegraded(service);
  }
});

test("startBackgroundServiceWithHealthSignal retries failed startup and clears degraded state on recovery", async (t) => {
  const service = "backup-job-queue";
  clearStartupServiceDegraded(service);
  const errorMock = t.mock.method(logger, "error", () => undefined);
  let attempts = 0;

  const handle = startBackgroundServiceWithHealthSignal({
    service,
    failureReason: "BACKUP_JOB_QUEUE_START_FAILED",
    failureDetails: "Backup background job queue failed to start; see server logs.",
    failureLogMessage: "Failed to start backup background job queue",
    retryDelayMs: 1,
    maxRetryDelayMs: 1,
    start: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("transient queue bootstrap failure");
      }
    },
  });
  t.after(() => {
    handle.stop();
    clearStartupServiceDegraded(service);
  });

  await sleep(20);

  assert.equal(attempts, 2);
  assert.equal(errorMock.mock.callCount(), 1);
  assert.equal(getStartupHealthSnapshot().degradedServices.some((entry) => entry.service === service), false);
});

test("startBackgroundServiceWithHealthSignal stop cancels pending retries", async (t) => {
  const service = "collection-rollup-refresh-queue";
  clearStartupServiceDegraded(service);
  t.mock.method(logger, "error", () => undefined);
  let attempts = 0;

  const handle = startBackgroundServiceWithHealthSignal({
    service,
    failureReason: "COLLECTION_ROLLUP_REFRESH_QUEUE_START_FAILED",
    failureDetails: "Collection rollup refresh queue failed to start; see server logs.",
    failureLogMessage: "Failed to start collection rollup refresh queue",
    retryDelayMs: 5,
    maxRetryDelayMs: 5,
    start: async () => {
      attempts += 1;
      throw new Error("persistent queue bootstrap failure");
    },
  });
  t.after(() => {
    handle.stop();
    clearStartupServiceDegraded(service);
  });

  await flushAsyncWork();
  handle.stop();
  await sleep(20);

  assert.equal(attempts, 1);
});

test("startBackgroundServiceWithHealthSignal stop clears stale degraded service state", async (t) => {
  const service = "background-job-queue";
  clearStartupServiceDegraded(service);
  t.mock.method(logger, "error", () => undefined);

  const handle = startBackgroundServiceWithHealthSignal({
    service,
    failureReason: "BACKGROUND_JOB_QUEUE_START_FAILED",
    failureDetails: "Background job queue failed to start; see server logs.",
    failureLogMessage: "Failed to start background job queue",
    retryDelayMs: 60_000,
    start: async () => {
      throw new Error("queue bootstrap failed");
    },
  });
  t.after(() => {
    handle.stop();
    clearStartupServiceDegraded(service);
  });

  await flushAsyncWork();
  assert.equal(
    getStartupHealthSnapshot().degradedServices.some((entry) => entry.service === service),
    true,
  );

  handle.stop();

  assert.equal(
    getStartupHealthSnapshot().degradedServices.some((entry) => entry.service === service),
    false,
  );
});
