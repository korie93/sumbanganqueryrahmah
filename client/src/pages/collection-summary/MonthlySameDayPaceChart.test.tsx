import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MonthlySameDayPaceChart } from "@/pages/collection-summary/MonthlySameDayPaceChart";
import { buildCollectionSameDayPaceComparison } from "@/pages/collection-summary/collection-monthly-comparison-utils";

const pace = buildCollectionSameDayPaceComparison({
  currentMonthKey: "2026-05",
  currentDaily: [1000, 2000, 1500, 1300, 1200, 1400, 1600, 1000, 2000]
    .map((amount, index) => ({ day: index + 1, amount })),
  previousDaily: [2000, 2200, 2100, 2000, 2300, 2200, 2100, 2000, 2100]
    .map((amount, index) => ({ day: index + 1, amount })),
  monthlyTargetAmount: 50000,
  referenceDate: new Date(2026, 4, 9, 12),
});

test("MonthlySameDayPaceChart renders same-day chart controls and summary accessibly", () => {
  assert.ok(pace);
  const markup = renderToStaticMarkup(
    createElement(MonthlySameDayPaceChart, {
      pace,
    }),
  );

  assert.match(markup, /Same-day pace trend/);
  assert.match(markup, /Cumulative collection from day 1 to day 30/);
  assert.match(markup, /Current range/);
  assert.match(markup, /Previous range/);
  assert.match(markup, /Same-day gap/);
  assert.match(markup, /Inspect day/);
  assert.match(markup, /Day 30 detail/);
  assert.match(markup, /Daily Difference/);
  assert.match(markup, /Cumulative Difference/);
  assert.match(markup, /View Full/);
  assert.match(markup, /role="img"/);
  assert.match(markup, /aria-label="Same-day cumulative collection comparison/);
});
