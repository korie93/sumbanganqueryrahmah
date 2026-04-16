import assert from "node:assert/strict";
import test from "node:test";
import {
  clearTrackedAIChatTimeout,
  clearTrackedAIChatTimeouts,
  scheduleTrackedAIChatTimeout,
} from "@/components/useAIChatRuntimeRefs";

test("scheduleTrackedAIChatTimeout unregisters settled timers and runs the callback once", () => {
  const originalWindow = globalThis.window;
  const trackedTimeouts = new Set<number>();
  const scheduledCallbacks = new Map<number, () => void>();
  let nextTimerId = 1;
  let callbackCalls = 0;

  Object.assign(globalThis, {
    window: {
      setTimeout(callback: () => void) {
        const timerId = nextTimerId;
        nextTimerId += 1;
        scheduledCallbacks.set(timerId, callback);
        return timerId;
      },
      clearTimeout(timerId: number) {
        scheduledCallbacks.delete(timerId);
      },
    },
  });

  try {
    const timerId = scheduleTrackedAIChatTimeout(trackedTimeouts, () => {
      callbackCalls += 1;
    }, 1500);

    assert.equal(trackedTimeouts.has(timerId), true);

    scheduledCallbacks.get(timerId)?.();

    assert.equal(callbackCalls, 1);
    assert.equal(trackedTimeouts.size, 0);
  } finally {
    Object.assign(globalThis, {
      window: originalWindow,
    });
  }
});

test("clearTrackedAIChatTimeout and clearTrackedAIChatTimeouts clear registered browser timers", () => {
  const originalClearTimeout = globalThis.clearTimeout;
  const clearedTimers: number[] = [];
  const trackedTimeouts = new Set<number>([11, 22, 33]);

  globalThis.clearTimeout = (((timerId?: number) => {
    if (typeof timerId === "number") {
      clearedTimers.push(timerId);
    }
  }) as unknown) as typeof clearTimeout;

  try {
    clearTrackedAIChatTimeout(trackedTimeouts, 22);
    assert.deepEqual(clearedTimers, [22]);
    assert.deepEqual(Array.from(trackedTimeouts), [11, 33]);

    clearTrackedAIChatTimeouts(trackedTimeouts);
    assert.deepEqual(clearedTimers, [22, 11, 33]);
    assert.equal(trackedTimeouts.size, 0);
  } finally {
    globalThis.clearTimeout = originalClearTimeout;
  }
});
