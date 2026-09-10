import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import {
  createRuntimeWsUpgradeRateLimiter,
  readRuntimeWsUpgradeRateLimitKey,
} from "../upgrade-rate-limit";

test("WebSocket upgrade rate limiter allows 30 attempts per key by default", () => {
  const limiter = createRuntimeWsUpgradeRateLimiter({ now: () => 1_000 });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    assert.equal(limiter.consume("activity:first"), true);
  }

  assert.equal(limiter.consume("activity:first"), false);
  assert.equal(limiter.consume("activity:second"), true);
});

test("WebSocket upgrade rate limiter resets at the inclusive default window boundary", () => {
  let timestamp = 1_234;
  const limiter = createRuntimeWsUpgradeRateLimiter({
    maxAttempts: 1,
    now: () => timestamp,
  });

  assert.equal(limiter.consume("user:first"), true);
  timestamp = 61_233;
  assert.equal(limiter.consume("user:first"), false);
  timestamp = 61_234;
  assert.equal(limiter.consume("user:first"), true);
  assert.equal(limiter.consume("user:first"), false);
  timestamp = 121_234;
  assert.equal(limiter.consume("user:first"), true);
});

test("WebSocket upgrade rate limiter clear releases quotas and key capacity", () => {
  const limiter = createRuntimeWsUpgradeRateLimiter({
    maxAttempts: 1,
    maxKeys: 1,
    now: () => 1_000,
  });

  assert.equal(limiter.consume("activity:first"), true);
  assert.equal(limiter.consume("activity:first"), false);
  assert.equal(limiter.consume("activity:second"), false);

  limiter.clear();
  assert.equal(limiter.consume("activity:first"), true);

  limiter.clear();
  assert.equal(limiter.consume("activity:second"), true);
});

test("WebSocket upgrade key pressure cannot evict live exhausted quotas", () => {
  const limiter = createRuntimeWsUpgradeRateLimiter({
    maxAttempts: 1,
    maxKeys: 2,
    now: () => 1_000,
  });

  assert.equal(limiter.consume("activity:first"), true);
  assert.equal(limiter.consume("activity:second"), true);

  for (let index = 0; index < 10; index += 1) {
    assert.equal(limiter.consume(`activity:overflow:${index}`), false);
    assert.equal(limiter.consume("activity:first"), false);
    assert.equal(limiter.consume("activity:second"), false);
  }
});

test("WebSocket upgrade key capacity preserves remaining attempts for existing keys", () => {
  const limiter = createRuntimeWsUpgradeRateLimiter({
    maxAttempts: 2,
    maxKeys: 1,
    now: () => 1_000,
  });

  assert.equal(limiter.consume("activity:first"), true);
  assert.equal(limiter.consume("activity:overflow"), false);
  assert.equal(limiter.consume("activity:first"), true);
  assert.equal(limiter.consume("activity:first"), false);
});

test("WebSocket upgrade expired buckets release capacity without resetting live quotas", () => {
  let timestamp = 0;
  const limiter = createRuntimeWsUpgradeRateLimiter({
    maxAttempts: 1,
    maxKeys: 2,
    windowMs: 100,
    now: () => timestamp,
  });

  assert.equal(limiter.consume("activity:first"), true);
  timestamp = 50;
  assert.equal(limiter.consume("activity:second"), true);
  timestamp = 99;
  assert.equal(limiter.consume("activity:third"), false);

  timestamp = 100;
  assert.equal(limiter.consume("activity:third"), true);
  assert.equal(limiter.consume("activity:second"), false);
  assert.equal(limiter.consume("activity:fourth"), false);

  timestamp = 150;
  assert.equal(limiter.consume("activity:fourth"), true);
  assert.equal(limiter.consume("activity:third"), false);
});

test("WebSocket upgrade IP keys ignore forged forwarding headers when untrusted", () => {
  for (const forwardedFor of ["192.0.2.10", "192.0.2.11, 192.0.2.12"]) {
    const req = {
      headers: { "x-forwarded-for": forwardedFor },
      socket: { remoteAddress: "198.51.100.20" },
    } as unknown as Pick<IncomingMessage, "headers" | "socket">;

    assert.equal(
      readRuntimeWsUpgradeRateLimitKey(req, { trustForwardedHeaders: false }),
      "198.51.100.20",
    );
  }
});

test("WebSocket upgrade IP keys honor a trusted edge's sanitized single client address", () => {
  const req = {
    headers: { "x-forwarded-for": "203.0.113.20" },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as Pick<IncomingMessage, "headers" | "socket">;

  assert.equal(
    readRuntimeWsUpgradeRateLimitKey(req, { trustForwardedHeaders: true }),
    "203.0.113.20",
  );
});
