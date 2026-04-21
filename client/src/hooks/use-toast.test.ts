import assert from "node:assert/strict";
import test from "node:test";
import {
  clearToastStateForTests,
  getToastStateForTests,
  getToastTimeoutCountForTests,
  subscribeToastState,
  toast,
} from "@/hooks/use-toast";

test.beforeEach(() => {
  clearToastStateForTests();
});

test.afterEach(() => {
  clearToastStateForTests();
});

test("subscribeToastState receives updates and unsubscribes cleanly", () => {
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

test("toast state cleanup clears pending removal timers when the last subscriber unsubscribes", () => {
  const unsubscribe = subscribeToastState(() => undefined);
  const firstToast = toast({
    title: "First",
    description: "hello",
  });

  firstToast.dismiss();

  assert.equal(getToastTimeoutCountForTests(), 1);
  unsubscribe();

  assert.equal(getToastTimeoutCountForTests(), 0);
  assert.deepEqual(getToastStateForTests(), { toasts: [] });
});
