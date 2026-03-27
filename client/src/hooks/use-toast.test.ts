import assert from "node:assert/strict";
import test from "node:test";
import { subscribeToastState, toast } from "@/hooks/use-toast";

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
