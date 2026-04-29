import assert from "node:assert/strict";
import test from "node:test";
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
    startBackgroundServiceWithHealthSignal({
      service,
      failureReason: "BACKUP_JOB_QUEUE_START_FAILED",
      failureDetails: "Backup background job queue failed to start; see server logs.",
      failureLogMessage: "Failed to start backup background job queue",
      start: async () => {
        throw new Error("queue bootstrap failed");
      },
    });

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

test("startBackgroundServiceWithHealthSignal clears stale degraded state on successful start", async () => {
  const service = "backup-job-queue";
  markStartupServiceDegraded(service, "BACKUP_JOB_QUEUE_START_FAILED", "Previous failure.");

  try {
    startBackgroundServiceWithHealthSignal({
      service,
      failureReason: "BACKUP_JOB_QUEUE_START_FAILED",
      failureDetails: "Backup background job queue failed to start; see server logs.",
      failureLogMessage: "Failed to start backup background job queue",
      start: async () => undefined,
    });

    await flushAsyncWork();

    const snapshot = getStartupHealthSnapshot();
    assert.equal(snapshot.degradedServices.some((entry) => entry.service === service), false);
  } finally {
    clearStartupServiceDegraded(service);
  }
});
