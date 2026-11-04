import assert from "node:assert/strict";
import test from "node:test";
import { AI_RESPONSE_REVEAL_MAX_MS, AI_RESPONSE_REVEAL_TICK_MS, getAIResponseRevealIndex, prefersReducedAIResponseMotion } from "./ai-response-reveal";

test("long answers finish within a bounded reveal on both existing typing speeds", () => {
  for (const length of [4000, 20000]) for (const delay of [12, 14, 18]) {
    const text = "A".repeat(length);
    assert.ok(getAIResponseRevealIndex(text, 40, delay) > 1);
    assert.ok(getAIResponseRevealIndex(text, 1200, delay) < length);
    assert.equal(getAIResponseRevealIndex(text, AI_RESPONSE_REVEAL_MAX_MS, delay), length);
    assert.ok(Math.ceil(AI_RESPONSE_REVEAL_MAX_MS / AI_RESPONSE_REVEAL_TICK_MS) <= 60);
  }
});

test("short answers retain progressive reveal and delayed ticks catch up without replaying characters", () => {
  const text = "Short synthetic answer";
  assert.equal(getAIResponseRevealIndex(text, -1, 14), 0);
  assert.equal(getAIResponseRevealIndex(text, 0, 14), 0);
  const progress = [40, 80, 120, 240, 4000].map((time) => getAIResponseRevealIndex(text, time, 14));
  assert.ok(progress[0]! > 0 && progress[0]! < text.length);
  assert.deepEqual([...progress].sort((a, b) => a - b), progress);
  assert.equal(progress[progress.length - 1], text.length);
  assert.equal(getAIResponseRevealIndex("", 100, 14), 0);
});

test("progress never exposes half an emoji surrogate pair and preserves the final text", () => {
  const text = "A🙂B👨‍👩‍👧‍👦C";
  for (let time = 0; time <= 500; time += 1) {
    const end = getAIResponseRevealIndex(text, time, 18);
    assert.ok(!(end > 0 && end < text.length
      && /[\uD800-\uDBFF]/.test(text.charAt(end - 1)) && /[\uDC00-\uDFFF]/.test(text.charAt(end))));
  }
  assert.equal(text.slice(0, getAIResponseRevealIndex(text, 4000, 18)), text);
});

test("JavaScript reduced-motion preference reflects changes while a reveal is active", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  let reduced = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    matchMedia(query: string) { assert.equal(query, "(prefers-reduced-motion: reduce)"); return { matches: reduced }; },
  } });
  try {
    assert.equal(prefersReducedAIResponseMotion(), false);
    reduced = true;
    assert.equal(prefersReducedAIResponseMotion(), true);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
