import assert from "node:assert/strict";
import test from "node:test";
import { lazyWithPreload, scheduleIdlePreload } from "./lazy-with-preload";

type TestWindow = Window & typeof globalThis;

test("lazyWithPreload reuses the same import promise across repeated preloads", async () => {
  let importCount = 0;
  const LazyComponent = lazyWithPreload(async () => {
    importCount += 1;
    return {
      default: () => null,
    };
  });

  const [first, second] = await Promise.all([
    LazyComponent.preload(),
    LazyComponent.preload(),
  ]);

  assert.equal(importCount, 1);
  assert.equal(first.default, second.default);
});

test("lazyWithPreload resets the cached promise after a failed import", async () => {
  let importCount = 0;
  const LazyComponent = lazyWithPreload(async () => {
    importCount += 1;
    if (importCount === 1) {
      throw new Error("temporary preload failure");
    }
    return {
      default: () => null,
    };
  });

  await assert.rejects(() => LazyComponent.preload(), /temporary preload failure/i);

  const loaded = await LazyComponent.preload();
  assert.equal(importCount, 2);
  assert.equal(typeof loaded.default, "function");
});

test("scheduleIdlePreload falls back to timeout scheduling when requestIdleCallback is unavailable", async () => {
  const globalWindow = globalThis as typeof globalThis & {
    window?: TestWindow;
  };
  const previousWindow = globalWindow.window;
  const scheduled: Array<() => void> = [];
  const cleared: number[] = [];
  let preloadCount = 0;

  globalWindow.window = {
    setTimeout: ((callback: TimerHandler) => {
      scheduled.push(callback as () => void);
      return scheduled.length;
    }) as typeof window.setTimeout,
    clearTimeout: ((handle?: number) => {
      if (typeof handle === "number") {
        cleared.push(handle);
      }
    }) as typeof window.clearTimeout,
  } as unknown as TestWindow;

  try {
    const cancel = scheduleIdlePreload(() => {
      preloadCount += 1;
    }, 25);

    assert.equal(preloadCount, 0);
    assert.equal(scheduled.length, 1);
    scheduled[0]?.();
    assert.equal(preloadCount, 1);

    cancel();
    assert.deepEqual(cleared, [1]);
  } finally {
    globalWindow.window = previousWindow;
  }
});

test("scheduleIdlePreload prefers requestIdleCallback when available", async () => {
  const globalWindow = globalThis as typeof globalThis & {
    window?: TestWindow;
  };
  const previousWindow = globalWindow.window;
  const cancelled: number[] = [];
  let preloadCount = 0;
  let scheduledCallback: (() => void) | undefined;

  globalWindow.window = {
    requestIdleCallback: ((callback: (deadline: IdleDeadline) => void) => {
      scheduledCallback = () => {
        callback({
          didTimeout: false,
          timeRemaining: () => 50,
        });
      };
      return 7;
    }) as unknown as TestWindow["requestIdleCallback"],
    cancelIdleCallback: ((handle: number) => {
      cancelled.push(handle);
    }) as unknown as TestWindow["cancelIdleCallback"],
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  } as unknown as TestWindow;

  try {
    const cancel = scheduleIdlePreload(() => {
      preloadCount += 1;
    });

    assert.equal(preloadCount, 0);
    scheduledCallback?.();
    assert.equal(preloadCount, 1);

    cancel();
    assert.deepEqual(cancelled, [7]);
  } finally {
    globalWindow.window = previousWindow;
  }
});
