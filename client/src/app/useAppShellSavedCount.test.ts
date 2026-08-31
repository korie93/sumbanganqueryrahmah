import assert from "node:assert/strict";
import test from "node:test";
import { startSavedCountSyncRuntime } from "@/app/useAppShellSavedCount";
import { SAVED_IMPORTS_CHANGED_EVENT } from "@/lib/api/imports";

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

test("saved-count runtime coalesces mutation bursts into one refresh", async () => {
  const eventTarget = new EventTarget();
  const scheduledCallbacks = new Map<number, () => void>();
  const counts: number[] = [];
  let fetchCalls = 0;
  let nextScheduleId = 0;

  const stop = startSavedCountSyncRuntime({
    cancelScheduledRefresh(handle) {
      scheduledCallbacks.delete(Number(handle));
    },
    eventTarget,
    async fetchCount() {
      fetchCalls += 1;
      return fetchCalls;
    },
    onCount(count) {
      counts.push(count);
    },
    scheduleRefresh(callback) {
      nextScheduleId += 1;
      scheduledCallbacks.set(nextScheduleId, callback);
      return nextScheduleId;
    },
  });

  await flushPromises();
  assert.equal(fetchCalls, 1);
  assert.deepEqual(counts, [1]);

  eventTarget.dispatchEvent(new Event(SAVED_IMPORTS_CHANGED_EVENT));
  eventTarget.dispatchEvent(new Event(SAVED_IMPORTS_CHANGED_EVENT));
  eventTarget.dispatchEvent(new Event(SAVED_IMPORTS_CHANGED_EVENT));

  assert.equal(scheduledCallbacks.size, 1);
  const refresh = Array.from(scheduledCallbacks.values())[0];
  assert.ok(refresh);
  scheduledCallbacks.clear();
  refresh();
  await flushPromises();

  assert.equal(fetchCalls, 2);
  assert.deepEqual(counts, [1, 2]);

  stop();
  eventTarget.dispatchEvent(new Event(SAVED_IMPORTS_CHANGED_EVENT));
  assert.equal(scheduledCallbacks.size, 0);
});

test("saved-count runtime aborts in-flight work and ignores late completion on cleanup", async () => {
  const eventTarget = new EventTarget();
  const counts: number[] = [];
  const requestState: {
    signal?: AbortSignal;
    resolve?: (count: number) => void;
  } = {};

  const stop = startSavedCountSyncRuntime({
    eventTarget,
    fetchCount(signal) {
      requestState.signal = signal;
      return new Promise<number>((resolve) => {
        requestState.resolve = resolve;
      });
    },
    onCount(count) {
      counts.push(count);
    },
  });

  const requestSignal = requestState.signal;
  assert.ok(requestSignal);
  stop();
  assert.equal(requestSignal.aborted, true);
  const resolveRequest = requestState.resolve;
  assert.ok(resolveRequest);
  resolveRequest(99);
  await flushPromises();

  assert.deepEqual(counts, []);
});
