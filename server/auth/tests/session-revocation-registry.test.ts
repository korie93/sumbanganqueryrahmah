import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionRevocationsForTests,
  getSessionRevocationRegistrySizeForTests,
  isSessionRevoked,
  revokeSession,
} from "../session-revocation-registry";

test.beforeEach(() => {
  clearSessionRevocationsForTests();
});

test.afterEach(() => {
  clearSessionRevocationsForTests();
});

test("session revocation registry treats revoked sessions as active only until the TTL expires", () => {
  revokeSession("activity-ttl", {
    now: 1_000,
    ttlMs: 120_000,
  });

  assert.equal(isSessionRevoked("activity-ttl", 1_001), true);
  assert.equal(isSessionRevoked("activity-ttl", 121_001), false);
  assert.equal(getSessionRevocationRegistrySizeForTests(), 0);
});

test("session revocation registry keeps the most recent entries when the cap is exceeded", () => {
  const now = Date.now();
  for (let index = 0; index < 10_005; index += 1) {
    revokeSession(`activity-${index}`, {
      now: now + index,
      ttlMs: 60_000,
    });
  }

  assert.equal(getSessionRevocationRegistrySizeForTests(), 10_000);
  assert.equal(isSessionRevoked("activity-0", now + 30_000), false);
  assert.equal(isSessionRevoked("activity-10004", now + 30_000), true);
});
