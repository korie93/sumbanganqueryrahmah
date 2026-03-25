import assert from "node:assert/strict";
import test from "node:test";
import { CollectionRollupRefreshQueueService } from "../collection-rollup-refresh-queue.service";
import type { CollectionRecordDailyRollupSlice } from "../../repositories/collection-record-repository-utils";

function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("Timed out waiting for predicate."));
        return;
      }
      setTimeout(tick, 10).unref?.();
    };
    tick();
  });
}

function createSlice(
  paymentDate = "2026-03-25",
  createdByLogin = "staff.user",
  collectionStaffNickname = "Collector Alpha",
): Required<CollectionRecordDailyRollupSlice> {
  return {
    paymentDate,
    createdByLogin,
    collectionStaffNickname,
  };
}

test("CollectionRollupRefreshQueueService waits for ensureReady before touching the repository", async () => {
  const callOrder: string[] = [];

  const service = new CollectionRollupRefreshQueueService({
    ensureReady: async () => {
      callOrder.push("ensure-ready:start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      callOrder.push("ensure-ready:end");
    },
    repository: {
      claimNextSlice: async () => null,
      completeSlice: async () => undefined,
      failSlice: async () => undefined,
      refreshSlice: async () => undefined,
      markRunningSlicesQueued: async () => {
        callOrder.push("mark-running");
      },
    },
    idlePollMs: 50,
  });

  await service.start();

  assert.deepEqual(callOrder, [
    "ensure-ready:start",
    "ensure-ready:end",
    "mark-running",
  ]);
});

test("CollectionRollupRefreshQueueService refreshes queued slices and completes them", async () => {
  const queuedSlices = [createSlice()];
  const refreshed: string[] = [];
  const completed: string[] = [];

  const service = new CollectionRollupRefreshQueueService({
    repository: {
      claimNextSlice: async () => queuedSlices.shift() || null,
      completeSlice: async (slice) => {
        completed.push(`${slice.paymentDate}:${slice.collectionStaffNickname}`);
      },
      failSlice: async () => undefined,
      refreshSlice: async (slice) => {
        refreshed.push(`${slice.paymentDate}:${slice.collectionStaffNickname}`);
      },
      markRunningSlicesQueued: async () => undefined,
    },
    idlePollMs: 50,
  });

  await service.start();
  await waitFor(() => completed.length === 1);

  assert.deepEqual(refreshed, ["2026-03-25:Collector Alpha"]);
  assert.deepEqual(completed, ["2026-03-25:Collector Alpha"]);
});

test("CollectionRollupRefreshQueueService requeues slices with a retry delay after refresh failures", async () => {
  const claimedSlices = [createSlice("2026-03-26", "staff.user", "Collector Beta")];
  const failed: Array<{ errorMessage: string; nextAttemptAt: Date }> = [];

  const service = new CollectionRollupRefreshQueueService({
    repository: {
      claimNextSlice: async () => claimedSlices.shift() || null,
      completeSlice: async () => undefined,
      failSlice: async (params) => {
        failed.push({
          errorMessage: params.errorMessage,
          nextAttemptAt: params.nextAttemptAt,
        });
      },
      refreshSlice: async () => {
        throw new Error("refresh exploded");
      },
      markRunningSlicesQueued: async () => undefined,
    },
    idlePollMs: 50,
    retryDelayMs: 25,
  });

  const before = Date.now();
  await service.start();
  await waitFor(() => failed.length === 1);

  assert.match(failed[0]?.errorMessage || "", /refresh exploded/i);
  assert.ok((failed[0]?.nextAttemptAt?.getTime() || 0) >= before + 20);
});
