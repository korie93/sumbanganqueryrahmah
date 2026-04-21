import assert from "node:assert/strict";
import test from "node:test";
import {
  applyReplicatedSessionRevocation,
  clearSessionRevocationsForTests,
  configureSessionRevocationReplication,
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

test("session revocation registry prefers keeping the longest-lived revocations under churn", () => {
  const now = Date.now();

  revokeSession("protected-activity", {
    now,
    ttlMs: 24 * 60 * 60 * 1000,
  });

  for (let index = 0; index < 10_004; index += 1) {
    revokeSession(`short-lived-${index}`, {
      now: now + index,
      ttlMs: 60_000,
    });
  }

  assert.equal(getSessionRevocationRegistrySizeForTests(), 10_000);
  assert.equal(isSessionRevoked("protected-activity", now + 120_000), true);
  assert.equal(isSessionRevoked("short-lived-0", now + 120_000), false);
});

test("session revocation registry publishes local revocations but does not rebroadcast replicated ones", () => {
  const publishedPayloads: Array<{ activityId: string; expiresAt: number }> = [];

  configureSessionRevocationReplication({
    publishRevocation(payload) {
      publishedPayloads.push(payload);
    },
  });

  revokeSession("activity-local", {
    now: 10_000,
    ttlMs: 120_000,
  });
  applyReplicatedSessionRevocation({
    activityId: "activity-remote",
    expiresAt: 50_000,
  }, 20_000);

  assert.deepEqual(publishedPayloads, [{
    activityId: "activity-local",
    expiresAt: 130_000,
  }]);
  assert.equal(isSessionRevoked("activity-local", 20_000), true);
  assert.equal(isSessionRevoked("activity-remote", 20_000), true);
});
