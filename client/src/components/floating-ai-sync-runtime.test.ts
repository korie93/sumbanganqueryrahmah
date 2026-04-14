import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupFloatingAiSyncRuntime,
  type FloatingAiSyncRuntimeState,
} from "@/components/floating-ai-sync-runtime";

test("cleanupFloatingAiSyncRuntime clears pending timeout and animation frame state", () => {
  const clearedTimeouts: number[] = [];
  const cancelledFrames: number[] = [];
  const state: FloatingAiSyncRuntimeState = {
    frame: 42,
    resizeDebounceHandle: 24,
    scheduled: true,
  };

  cleanupFloatingAiSyncRuntime(
    {
      cancelAnimationFrame(frame: number) {
        cancelledFrames.push(frame);
      },
      clearTimeout(timeoutId: number) {
        clearedTimeouts.push(timeoutId);
      },
    },
    state,
  );

  assert.deepEqual(clearedTimeouts, [24]);
  assert.deepEqual(cancelledFrames, [42]);
  assert.deepEqual(state, {
    frame: 0,
    resizeDebounceHandle: null,
    scheduled: false,
  });
});

test("cleanupFloatingAiSyncRuntime stays idempotent when nothing is pending", () => {
  const state: FloatingAiSyncRuntimeState = {
    frame: 0,
    resizeDebounceHandle: null,
    scheduled: false,
  };

  cleanupFloatingAiSyncRuntime(
    {
      cancelAnimationFrame() {
        throw new Error("should not cancel a frame");
      },
      clearTimeout() {
        throw new Error("should not clear a timeout");
      },
    },
    state,
  );

  assert.deepEqual(state, {
    frame: 0,
    resizeDebounceHandle: null,
    scheduled: false,
  });
});
