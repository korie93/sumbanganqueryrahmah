import assert from "node:assert/strict";
import test from "node:test";
import { TwoFactorReplayCache } from "../two-factor-replay-cache";

test("TwoFactorReplayCache accepts a code once per subject and purpose during the TTL", () => {
  let now = 1_000;
  const cache = new TwoFactorReplayCache({ now: () => now, ttlMs: 120_000, maxEntries: 10 });

  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "123456" }), true);
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "123456" }), false);

  assert.equal(cache.consume({ purpose: "login", subjectId: "user-2", code: "123456" }), true);
  assert.equal(cache.consume({ purpose: "setup", subjectId: "user-1", code: "123456" }), true);

  now += 121_000;
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "123456" }), true);
});

test("TwoFactorReplayCache rejects malformed input without growing the cache", () => {
  const cache = new TwoFactorReplayCache({ now: () => 1_000, ttlMs: 120_000, maxEntries: 10 });

  assert.equal(cache.consume({ purpose: "login", subjectId: "", code: "123456" }), false);
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "abc" }), false);
  assert.equal(cache.size, 0);
});

test("TwoFactorReplayCache remains bounded when many distinct codes are consumed", () => {
  const cache = new TwoFactorReplayCache({ now: () => 1_000, ttlMs: 120_000, maxEntries: 2 });

  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "111111" }), true);
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "222222" }), true);
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "333333" }), true);

  assert.equal(cache.size, 2);
});
