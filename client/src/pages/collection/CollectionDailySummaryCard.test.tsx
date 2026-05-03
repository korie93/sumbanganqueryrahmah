import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionDailyOverviewResponse } from "@/lib/api";
import { CollectionDailySummaryCard } from "@/pages/collection/CollectionDailySummaryCard";

const overview: CollectionDailyOverviewResponse = {
  ok: true,
  username: "ALPHA",
  usernames: ["ALPHA"],
  role: "admin",
  month: {
    year: 2026,
    month: 5,
    daysInMonth: 31,
  },
  summary: {
    monthlyTarget: 100000,
    collectedToDate: 42000,
    collectedAmount: 42000,
    remainingTarget: 58000,
    balancedAmount: 58000,
    workingDays: 22,
    elapsedWorkingDays: 10,
    remainingWorkingDays: 12,
    requiredPerRemainingWorkingDay: 4833.33,
    completedDays: 7,
    incompleteDays: 3,
    noCollectionDays: 1,
    neutralDays: 0,
    baseDailyTarget: 4545.45,
    dailyTarget: 4545.45,
    expectedProgressAmount: 45454.55,
    progressVarianceAmount: -3454.55,
    achievedAmount: 42000,
    remainingAmount: 58000,
    metDays: 7,
    yellowDays: 3,
    redDays: 1,
  },
  days: [],
  carryForwardRule: "none",
  freshness: {
    status: "fresh",
    pendingCount: 0,
    runningCount: 0,
    retryCount: 0,
    oldestPendingAgeMs: 0,
    message: "Fresh rollups",
  },
};

test("CollectionDailySummaryCard separates primary and supporting indicators", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailySummaryCard, {
      overview,
    }),
  );

  assert.match(markup, /Daily Performance Summary/);
  assert.match(markup, /Monthly Target/);
  assert.match(markup, /Required Per Remaining Day/);
  assert.match(markup, /Supporting Indicators/);
  assert.match(markup, /Progress Variance/);
  assert.match(markup, /rounded-2xl border border-border\/60 bg-background p-4 shadow-sm/);
});
