import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import {
  buildCollectionMonthlyComparisonAccessibleSummary,
  buildDefaultCollectionMonthlyComparisonRange,
  countCollectionMonthsInclusive,
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonPercentage,
  shiftCollectionMonthInput,
} from "@/pages/collection-summary/collection-monthly-comparison-utils";

const comparisonPayload: CollectionMonthlyComparisonResponse = {
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

test("collection monthly comparison helpers keep month ranges bounded and stable", () => {
  const defaultRange = buildDefaultCollectionMonthlyComparisonRange(new Date("2026-05-20T00:00:00.000Z"));
  assert.deepEqual(defaultRange, {
    startMonth: "2025-12",
    endMonth: "2026-05",
  });
  assert.equal(shiftCollectionMonthInput("2026-05", -1), "2026-04");
  assert.equal(shiftCollectionMonthInput("2026-01", -1), "2025-12");
  assert.equal(countCollectionMonthsInclusive("2026-04", "2026-05"), 2);
  assert.equal(countCollectionMonthsInclusive("2026-04", "2027-03"), 12);
});

test("collection monthly comparison helpers format difference, percentage, and accessible summaries clearly", () => {
  assert.match(formatCollectionMonthlyComparisonDifference(12450), /^\+RM(?:\u00A0| )12,450\.00$/);
  assert.match(formatCollectionMonthlyComparisonDifference(-5200), /^-RM(?:\u00A0| )5,200\.00$/);
  assert.equal(formatCollectionMonthlyComparisonDifference(null), "—");
  assert.equal(formatCollectionMonthlyComparisonPercentage(17.67), "+17.67%");
  assert.equal(formatCollectionMonthlyComparisonPercentage(0), "0.00%");
  assert.equal(formatCollectionMonthlyComparisonPercentage(null), "No previous month total");
  assert.match(
    buildCollectionMonthlyComparisonAccessibleSummary(comparisonPayload),
    /Collection increased by RM12,450\.00 \(\+17\.67%\) compared to Apr 2026\./,
  );
  assert.match(
    buildCollectionMonthlyComparisonAccessibleSummary(comparisonPayload),
    /Apr 2026: RM(?:\u00A0| )70,450\.00 across 123 record\(s\)/,
  );
});
