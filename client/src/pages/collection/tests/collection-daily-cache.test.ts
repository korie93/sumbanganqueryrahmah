import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionDailyDayDetailsCacheKey,
  buildCollectionDailyOverviewCacheKey,
  createCollectionDailyDayDetailsCache,
  createCollectionDailyOverviewCache,
  normalizeCollectionDailyCacheUsers,
} from "@/pages/collection/collection-daily-cache";
import type {
  CollectionDailyDayDetailsResponse,
  CollectionDailyOverviewResponse,
} from "@/lib/api/collection-types";

function createOverviewResponse(monthlyTarget: number): CollectionDailyOverviewResponse {
  return {
    ok: true,
    username: "collector.user",
    usernames: ["collector.user"],
    role: "user",
    month: {
      year: 2026,
      month: 3,
      daysInMonth: 31,
    },
    summary: {
      monthlyTarget,
      collectedToDate: 0,
      collectedAmount: 0,
      remainingTarget: monthlyTarget,
      balancedAmount: 0,
      workingDays: 22,
      elapsedWorkingDays: 1,
      remainingWorkingDays: 21,
      requiredPerRemainingWorkingDay: 0,
      completedDays: 0,
      incompleteDays: 0,
      noCollectionDays: 0,
      neutralDays: 0,
      baseDailyTarget: 0,
      dailyTarget: 0,
      expectedProgressAmount: 0,
      progressVarianceAmount: 0,
      achievedAmount: 0,
      remainingAmount: monthlyTarget,
      metDays: 0,
      yellowDays: 0,
      redDays: 0,
    },
    days: [],
  };
}

function createDayDetailsResponse(date: string): CollectionDailyDayDetailsResponse {
  return {
    ok: true,
    username: "collector.user",
    usernames: ["collector.user"],
    date,
    status: "neutral",
    message: "",
    amount: 0,
    dailyTarget: 0,
    customers: [],
    summary: {
      monthlyTarget: 0,
      collected: 0,
      balanced: 0,
      totalForDate: 0,
      targetForDate: 0,
    },
    pagination: {
      page: 1,
      pageSize: 10,
      totalRecords: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    records: [],
  };
}

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

  cache.set("overview-1", { overview: createOverviewResponse(1) });
  cache.set("overview-2", { overview: createOverviewResponse(2) });
  assert.equal(cache.size(), 2);

  assert.equal(cache.get("overview-1")?.overview.summary.monthlyTarget, 1);

  cache.set("overview-3", { overview: createOverviewResponse(3) });

  assert.equal(cache.get("overview-2"), null);
  assert.equal(cache.get("overview-1")?.overview.summary.monthlyTarget, 1);
  assert.equal(cache.get("overview-3")?.overview.summary.monthlyTarget, 3);
});

test("createCollectionDailyDayDetailsCache clear removes cached day details", () => {
  const cache = createCollectionDailyDayDetailsCache(2);

  cache.set("detail-1", { dayDetails: createDayDetailsResponse("2026-03-24") });
  cache.clear();

  assert.equal(cache.size(), 0);
  assert.equal(cache.get("detail-1"), null);
});
