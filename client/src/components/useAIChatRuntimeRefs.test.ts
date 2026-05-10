import assert from "node:assert/strict";
import test from "node:test";

import { cleanupAIChatRuntimeRefs } from "@/components/useAIChatRuntimeRefs";

test("cleanupAIChatRuntimeRefs aborts requests and clears timers defensively", () => {
  const controller = new AbortController();
  const clearedIntervals: number[] = [];
  const clearedTimeouts: number[] = [];
  const originalClearInterval = globalThis.clearInterval;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.clearInterval = ((timerId: number) => {
    clearedIntervals.push(Number(timerId));
    return undefined;
  }) as typeof globalThis.clearInterval;
  globalThis.clearTimeout = ((timerId: number) => {
    clearedTimeouts.push(Number(timerId));
    return undefined;
  }) as typeof globalThis.clearTimeout;

  try {
    const requestControllerRef = { current: controller };
    const requestTimeoutRef = { current: 10 };
    const typingIntervalRef = { current: 23 };
    const retryTimersRef = { current: new Set([11, 12]) };
    const slowNoticeTimerRef = { current: 13 };
    const processingRef = { current: true };
    const isMountedRef = { current: true };

    cleanupAIChatRuntimeRefs({
      requestControllerRef,
      requestTimeoutRef,
      typingIntervalRef,
      retryTimersRef,
      slowNoticeTimerRef,
      processingRef,
      isMountedRef,
    });

    assert.equal(controller.signal.aborted, true);
    assert.equal(requestControllerRef.current, null);
    assert.equal(requestTimeoutRef.current, null);
    assert.equal(typingIntervalRef.current, null);
    assert.equal(retryTimersRef.current.size, 0);
    assert.equal(slowNoticeTimerRef.current, null);
    assert.equal(processingRef.current, false);
    assert.equal(isMountedRef.current, false);
    assert.deepEqual(clearedIntervals, [23]);
    assert.deepEqual(clearedTimeouts, [10, 11, 12, 13]);
  } finally {
    globalThis.clearInterval = originalClearInterval;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("cleanupAIChatRuntimeRefs stays safe when cleanup runs more than once", () => {
  const controller = new AbortController();
  const clearedIntervals: number[] = [];
  const clearedTimeouts: number[] = [];
  const originalClearInterval = globalThis.clearInterval;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.clearInterval = ((timerId: number) => {
    clearedIntervals.push(Number(timerId));
    return undefined;
  }) as typeof globalThis.clearInterval;
  globalThis.clearTimeout = ((timerId: number) => {
    clearedTimeouts.push(Number(timerId));
    return undefined;
  }) as typeof globalThis.clearTimeout;

  try {
    const requestControllerRef = { current: controller };
    const requestTimeoutRef = { current: 10 };
    const typingIntervalRef = { current: 23 };
    const retryTimersRef = { current: new Set([11]) };
    const slowNoticeTimerRef = { current: 13 };
    const processingRef = { current: true };
    const isMountedRef = { current: true };

    cleanupAIChatRuntimeRefs({
      requestControllerRef,
      requestTimeoutRef,
      typingIntervalRef,
      retryTimersRef,
      slowNoticeTimerRef,
      processingRef,
      isMountedRef,
    });
    cleanupAIChatRuntimeRefs({
      requestControllerRef,
      requestTimeoutRef,
      typingIntervalRef,
      retryTimersRef,
      slowNoticeTimerRef,
      processingRef,
      isMountedRef,
    });

    assert.equal(controller.signal.aborted, true);
    assert.deepEqual(clearedIntervals, [23]);
    assert.deepEqual(clearedTimeouts, [10, 11, 13]);
  } finally {
    globalThis.clearInterval = originalClearInterval;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
