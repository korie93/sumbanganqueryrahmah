import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionDailyDayDetailsCacheKey,
  buildCollectionDailyOverviewCacheKey,
  createCollectionDailyDayDetailsCache,
  createCollectionDailyOverviewCache,
  normalizeCollectionDailyCacheUsers,
} from "@/pages/collection/collection-daily-cache";

test("normalizeCollectionDailyCacheUsers dedupes and sorts usernames", () => {
  assert.deepEqual(
    normalizeCollectionDailyCacheUsers([" Beta ", "alpha", "ALPHA", "", " beta"]),
    ["alpha", "beta"],
  );
});

test("buildCollectionDailyOverviewCacheKey normalizes username casing and order", () => {
  const first = buildCollectionDailyOverviewCacheKey({
    year: 2026,
    month: 3,
    usernames: [" Collector Beta ", "collector alpha"],
  });
  const second = buildCollectionDailyOverviewCacheKey({
    year: 2026,
    month: 3,
    usernames: ["collector alpha", "COLLECTOR BETA"],
  });

  assert.equal(first, second);
});

test("buildCollectionDailyDayDetailsCacheKey keeps page-specific entries distinct", () => {
  const first = buildCollectionDailyDayDetailsCacheKey({
    date: "2026-03-24",
    usernames: ["collector alpha"],
    page: 1,
    pageSize: 10,
  });
  const second = buildCollectionDailyDayDetailsCacheKey({
    date: "2026-03-24",
    usernames: ["collector alpha"],
    page: 2,
    pageSize: 10,
  });

  assert.notEqual(first, second);
});

test("createCollectionDailyOverviewCache evicts least-recently-used entries", () => {
  const cache = createCollectionDailyOverviewCache(2);

  cache.set("overview-1", { overview: { summary: { monthlyTarget: 1 } } as any });
  cache.set("overview-2", { overview: { summary: { monthlyTarget: 2 } } as any });
  assert.equal(cache.size(), 2);

  assert.equal(cache.get("overview-1")?.overview.summary.monthlyTarget, 1);

  cache.set("overview-3", { overview: { summary: { monthlyTarget: 3 } } as any });

  assert.equal(cache.get("overview-2"), null);
  assert.equal(cache.get("overview-1")?.overview.summary.monthlyTarget, 1);
  assert.equal(cache.get("overview-3")?.overview.summary.monthlyTarget, 3);
});

test("createCollectionDailyDayDetailsCache clear removes cached day details", () => {
  const cache = createCollectionDailyDayDetailsCache(2);

  cache.set("detail-1", { dayDetails: { date: "2026-03-24" } as any });
  cache.clear();

  assert.equal(cache.size(), 0);
  assert.equal(cache.get("detail-1"), null);
});
