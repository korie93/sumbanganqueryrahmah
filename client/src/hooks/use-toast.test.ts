import assert from "node:assert/strict";
import test from "node:test";
import { subscribeToastState, toast, TOAST_REMOVE_DELAY_MS } from "@/hooks/use-toast";

function latestToastCount(seenToastCounts: number[]) {
  return seenToastCounts[seenToastCounts.length - 1];
}

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

test("dismissed toast is removed after a bounded cleanup delay", (t) => {
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
