import assert from "node:assert/strict";
import test from "node:test";
import { getInternalMetricsSnapshot } from "../../internal/metrics";
import {
  TAB_VISIBILITY_CACHE_MAX_SIZE,
  TAB_VISIBILITY_CACHE_TTL_MS,
} from "../guard-cache";
import { createRoleTabVisibilityCache } from "../guard-tab-visibility";

test("role tab visibility cache stays bounded and publishes pressure gauges", async () => {
  let lookupCount = 0;
  const cache = createRoleTabVisibilityCache({
    storage: {
      getRoleTabVisibility: async (role: string) => {
        lookupCount += 1;
        return { [role]: true };
      },
    },
  });

  try {
    for (let index = 0; index < TAB_VISIBILITY_CACHE_MAX_SIZE + 5; index += 1) {
      await cache.getRoleTabVisibilityCached(`role-${index}`);
    }

    const stats = cache.getStats();
    const metrics = getInternalMetricsSnapshot();

    assert.equal(lookupCount, TAB_VISIBILITY_CACHE_MAX_SIZE + 5);
    assert.equal(stats.size, TAB_VISIBILITY_CACHE_MAX_SIZE);
    assert.equal(stats.maxSize, TAB_VISIBILITY_CACHE_MAX_SIZE);
    assert.equal(stats.utilization, 1);
    assert.equal(metrics.gauges.authTabVisibilityCacheSize, TAB_VISIBILITY_CACHE_MAX_SIZE);
    assert.equal(metrics.gauges.authTabVisibilityCacheUtilization, 1);
    assert.ok(metrics.counters.authTabVisibilityCacheEvictionsTotal >= 5);
  } finally {
    cache.stop();
  }
});

test("role tab visibility cache reports expired sweeps and clear operations", async (t) => {
  const nowValues = [
    1_000_000,
    1_000_000 + TAB_VISIBILITY_CACHE_TTL_MS + 1,
  ];
  t.mock.method(Date, "now", () => nowValues.shift() ?? 1_000_000 + TAB_VISIBILITY_CACHE_TTL_MS + 1);

  const cache = createRoleTabVisibilityCache({
    storage: {
      getRoleTabVisibility: async (role: string) => ({ [role]: true }),
    },
  });

  try {
    await cache.getRoleTabVisibilityCached("admin-a");
    await cache.getRoleTabVisibilityCached("admin-b");

    const statsAfterSweep = cache.getStats();
    const metricsAfterSweep = getInternalMetricsSnapshot();

    assert.equal(statsAfterSweep.size, 1);
    assert.ok(metricsAfterSweep.counters.authTabVisibilityCacheExpiredEntriesTotal >= 1);
    assert.equal(metricsAfterSweep.gauges.authTabVisibilityCacheSize, 1);

    cache.clear();

    assert.equal(cache.getStats().size, 0);
    assert.equal(getInternalMetricsSnapshot().gauges.authTabVisibilityCacheSize, 0);
  } finally {
    cache.stop();
  }
});
