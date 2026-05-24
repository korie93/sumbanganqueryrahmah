import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWsMessageRateLimiter } from "../message-rate-limit";

test("runtime WebSocket message limiter resets counts by window", () => {
  let now = 1_000;
  const limiter = createRuntimeWsMessageRateLimiter({
    maxMessages: 2,
    windowMs: 1_000,
    now: () => now,
  });

  assert.equal(limiter.consume(), true);
  assert.equal(limiter.consume(), true);
  assert.equal(limiter.consume(), false);

  now += 1_000;

  assert.equal(limiter.consume(), true);
  assert.equal(limiter.consume(), true);
  assert.equal(limiter.consume(), false);
});

test("runtime WebSocket message limiter can be reset explicitly", () => {
  const limiter = createRuntimeWsMessageRateLimiter({
    maxMessages: 1,
    windowMs: 60_000,
    now: () => 1_000,
  });

  assert.equal(limiter.consume(), true);
  assert.equal(limiter.consume(), false);
  limiter.reset();
  assert.equal(limiter.consume(), true);
});
