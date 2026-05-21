import assert from "node:assert/strict";
import test from "node:test";
import { TwoFactorReplayCache } from "../two-factor-replay-cache";
import {
  assertProductionTwoFactorReplayCacheTopologySafety,
  buildTwoFactorReplayCacheTopologyWarning,
  requiresSingleWorkerForProcessLocalTwoFactorReplayCache,
} from "../two-factor-replay-topology";

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

test("TwoFactorReplayCache defers full sweeps until the interval or size threshold is reached", () => {
  let now = 1_000;
  const cache = new TwoFactorReplayCache({
    now: () => now,
    ttlMs: 1_000,
    maxEntries: 10,
    sweepMinIntervalMs: 10_000,
    sweepThresholdEntries: 10,
  });

  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "111111" }), true);
  assert.equal(cache.size, 1);

  now = 3_000;
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "222222" }), true);
  assert.equal(cache.size, 2);

  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "111111" }), true);
  assert.equal(cache.size, 2);

  now = 12_000;
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "333333" }), true);
  assert.equal(cache.size, 1);
});

test("TwoFactorReplayCache trims the earliest expiring active entry instead of relying on insertion order", () => {
  let now = 100_000;
  const cache = new TwoFactorReplayCache({ now: () => now, ttlMs: 120_000, maxEntries: 2 });

  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "111111" }), true);
  now = 1_000;
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "222222" }), true);
  now = 2_000;
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "333333" }), true);

  assert.equal(cache.size, 2);
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "111111" }), false);
  assert.equal(cache.consume({ purpose: "login", subjectId: "user-1", code: "222222" }), true);
});

test("TwoFactorReplayCache exposes the multi-worker topology constraint explicitly", () => {
  assert.equal(requiresSingleWorkerForProcessLocalTwoFactorReplayCache(1), false);
  assert.equal(requiresSingleWorkerForProcessLocalTwoFactorReplayCache(2), true);
  assert.equal(buildTwoFactorReplayCacheTopologyWarning(1), null);
  assert.match(String(buildTwoFactorReplayCacheTopologyWarning(2)), /process-local/i);
});

test("TwoFactorReplayCache topology fails fast for production multi-worker without shared replay state", () => {
  assert.throws(
    () =>
      assertProductionTwoFactorReplayCacheTopologySafety({
        isProductionLike: true,
        sharedReplayStoreConfigured: false,
        workerCount: 2,
      }),
    /SQR_MAX_WORKERS greater than 1 is not allowed/i,
  );

  assert.doesNotThrow(() =>
    assertProductionTwoFactorReplayCacheTopologySafety({
      isProductionLike: false,
      sharedReplayStoreConfigured: false,
      workerCount: 2,
    }),
  );

  assert.doesNotThrow(() =>
    assertProductionTwoFactorReplayCacheTopologySafety({
      isProductionLike: true,
      sharedReplayStoreConfigured: false,
      workerCount: 1,
    }),
  );

  assert.doesNotThrow(() =>
    assertProductionTwoFactorReplayCacheTopologySafety({
      isProductionLike: true,
      sharedReplayStoreConfigured: true,
      workerCount: 2,
    }),
  );
});
