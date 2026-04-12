import assert from "node:assert/strict";
import test from "node:test";
import { createActiveImportUploadQuotaTracker } from "../imports-upload-quota";

test("createActiveImportUploadQuotaTracker enforces per-subject quotas independently", () => {
  const tracker = createActiveImportUploadQuotaTracker(10);

  assert.equal(tracker.tryReserve("alice", 6), true);
  assert.equal(tracker.tryReserve("alice", 5), false);
  assert.equal(tracker.tryReserve("bob", 10), true);
  assert.equal(tracker.getUsage("alice"), 6);
  assert.equal(tracker.getUsage("bob"), 10);
});

test("createActiveImportUploadQuotaTracker releases usage without underflow leaks", () => {
  const tracker = createActiveImportUploadQuotaTracker(10);

  assert.equal(tracker.tryReserve("alice", 10), true);
  tracker.release("alice", 4);
  assert.equal(tracker.getUsage("alice"), 6);
  tracker.release("alice", 20);
  assert.equal(tracker.getUsage("alice"), 0);
  assert.equal(tracker.tryReserve("alice", 10), true);
});
