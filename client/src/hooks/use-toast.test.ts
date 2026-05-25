import assert from "node:assert/strict";
import test from "node:test";
import {
  getToastListenerCountForTests,
  getToastTimeoutCountForTests,
  resetToastStateForTests,
  subscribeToastState,
  toast,
  TOAST_LISTENER_LIMIT,
  TOAST_REMOVE_DELAY_MS,
  TOAST_TIMEOUT_LIMIT,
} from "@/hooks/use-toast";

function latestToastCount(seenToastCounts: number[]) {
  return seenToastCounts[seenToastCounts.length - 1];
}

test("subscribeToastState receives updates and unsubscribes cleanly", () => {
  resetToastStateForTests();
  const seenToastCounts: number[] = [];
  const unsubscribe = subscribeToastState((state) => {
    seenToastCounts.push(state.toasts.length);
  });

  toast({
    title: "First",
    description: "hello",
  });

  assert.deepEqual(seenToastCounts, [1]);

  unsubscribe();

  toast({
    title: "Second",
    description: "world",
  });

  assert.deepEqual(seenToastCounts, [1]);
});

test("dismissed toast is removed after a bounded cleanup delay", (t) => {
  resetToastStateForTests();
  t.mock.timers.enable({ apis: ["setTimeout"], now: 0 });
  const seenToastCounts: number[] = [];
  const unsubscribe = subscribeToastState((state) => {
    seenToastCounts.push(state.toasts.length);
  });

  const currentToast = toast({
    title: "Timed",
    description: "cleanup",
  });
  currentToast.dismiss();

  assert.equal(latestToastCount(seenToastCounts), 1);
  t.mock.timers.tick(TOAST_REMOVE_DELAY_MS - 1);
  assert.equal(latestToastCount(seenToastCounts), 1);

  t.mock.timers.tick(1);
  assert.equal(latestToastCount(seenToastCounts), 0);

  unsubscribe();
  t.mock.timers.reset();
});

test("toast timeout cleanup stays bounded when many dismissed toasts are created", () => {
  resetToastStateForTests();

  for (let index = 0; index < 50; index += 1) {
    const currentToast = toast({
      title: `Toast ${index}`,
      description: "bounded cleanup",
    });
    currentToast.dismiss();
  }

  assert.ok(getToastTimeoutCountForTests() <= TOAST_TIMEOUT_LIMIT);
  resetToastStateForTests();
});

test("toast subscriptions are deduplicated, capped, and removed on cleanup", () => {
  resetToastStateForTests();
  const listener = () => undefined;

  const unsubscribeFirst = subscribeToastState(listener);
  const unsubscribeDuplicate = subscribeToastState(listener);
  assert.equal(getToastListenerCountForTests(), 1);

  unsubscribeDuplicate();
  assert.equal(getToastListenerCountForTests(), 0);
  unsubscribeFirst();
  assert.equal(getToastListenerCountForTests(), 0);

  const unsubscribers = Array.from({ length: TOAST_LISTENER_LIMIT + 5 }, () =>
    subscribeToastState(() => undefined),
  );
  assert.equal(getToastListenerCountForTests(), TOAST_LISTENER_LIMIT);

  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  assert.equal(getToastListenerCountForTests(), 0);
});
