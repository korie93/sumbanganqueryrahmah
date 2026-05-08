import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { MonthlyCollectionComparisonChart } from "@/pages/collection-summary/MonthlyCollectionComparisonChart";

const chartPayload: CollectionMonthlyComparisonResponse = {
  ok: true,
  nickname: "Collector Alpha",
  startMonth: "2026-04",
  endMonth: "2026-05",
  months: [
    {
      month: "2026-04",
      label: "Apr 2026",
      totalCollection: 70450,
      recordCount: 123,
      averagePerRecord: 572.76,
    },
    {
      month: "2026-05",
      label: "May 2026",
      totalCollection: 82900,
      recordCount: 146,
      averagePerRecord: 567.81,
    },
  ],
  comparison: {
    baseMonth: "2026-04",
    targetMonth: "2026-05",
    baseLabel: "Apr 2026",
    targetLabel: "May 2026",
    baseTotal: 70450,
    targetTotal: 82900,
    difference: 12450,
    percentageChange: 17.67,
    direction: "increase",
    summary: "Collection increased by RM12,450.00 (+17.67%) compared to Apr 2026.",
  },
};

test("MonthlyCollectionComparisonChart renders compact chart controls accessibly", () => {
  const markup = renderToStaticMarkup(
    createElement(MonthlyCollectionComparisonChart, {
      data: chartPayload,
      monthlyTargetAmount: 80000,
    }),
  );

  assert.match(markup, /Monthly performance trend/);
  assert.match(markup, /Range total/);
  assert.match(markup, /Target progress/);
  assert.match(markup, /Peak month/);
  assert.match(markup, /Active months/);
  assert.match(markup, /Minimize chart/);
  assert.match(markup, /Expand chart/);
  assert.match(markup, /aria-controls=/);
});
