import assert from "node:assert/strict";
import test from "node:test";
import { buildRateLimiterTopologyWarning } from "../../middleware/rate-limit-runtime";

test("buildRateLimiterTopologyWarning stays quiet for single-worker deployments", () => {
  assert.equal(
    buildRateLimiterTopologyWarning({
      distributedStoreConfigured: false,
      workerCount: 1,
    }),
    null,
  );
});

test("buildRateLimiterTopologyWarning stays quiet when a shared store is configured", () => {
  assert.equal(
    buildRateLimiterTopologyWarning({
      distributedStoreConfigured: true,
      workerCount: 4,
    }),
    null,
  );
});

test("buildRateLimiterTopologyWarning warns when multi-worker deployments still use in-memory storage", () => {
  const warning = buildRateLimiterTopologyWarning({
    distributedStoreConfigured: false,
    workerCount: 4,
  });

  assert.match(warning ?? "", /shared store/i);
  assert.match(warning ?? "", /in-memory/i);
});
