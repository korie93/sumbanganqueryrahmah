import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import {
  COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT,
  buildCollectionMonthlyComparisonAccessibleSummary,
  buildCollectionMonthlyComparisonCsv,
  buildCollectionMonthlyComparisonCsvFilename,
  buildCollectionMonthlyComparisonInsights,
  buildCollectionMonthlyComparisonPrintReportHtml,
  buildCollectionMonthlyComparisonPresetRanges,
  buildCollectionMonthlyComparisonTargetSummary,
  buildCollectionMonthlyComparisonTrendExplanation,
  buildDefaultCollectionMonthlyComparisonRange,
  countCollectionMonthsInclusive,
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonPercentage,
  parseCollectionMonthKey,
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

const anomalyPayload: CollectionMonthlyComparisonResponse = {
  ...comparisonPayload,
  months: [
    comparisonPayload.months[0]!,
    {
      ...comparisonPayload.months[1]!,
      totalCollection: 95000,
      averagePerRecord: 650.68,
    },
  ],
  comparison: {
    ...comparisonPayload.comparison,
    targetTotal: 95000,
    difference: 24550,
    percentageChange: 34.85,
    summary: "Collection increased by RM24,550.00 (+34.85%) compared to Apr 2026.",
  },
};

test("collection monthly comparison helpers keep month ranges bounded and stable", () => {
  const defaultRange = buildDefaultCollectionMonthlyComparisonRange(new Date(2026, 4, 20, 12));
  assert.deepEqual(defaultRange, {
    startMonth: "2026-04",
    endMonth: "2026-05",
  });
  assert.deepEqual(buildDefaultCollectionMonthlyComparisonRange(new Date(2026, 0, 10, 12)), {
    startMonth: "2025-12",
    endMonth: "2026-01",
  });
  assert.equal(shiftCollectionMonthInput("2026-05", -1), "2026-04");
  assert.equal(shiftCollectionMonthInput("2026-01", -1), "2025-12");
  assert.equal(countCollectionMonthsInclusive("2026-04", "2026-05"), 2);
  assert.equal(countCollectionMonthsInclusive("2026-04", "2027-03"), 12);
  assert.deepEqual(parseCollectionMonthKey("2026-05"), { year: 2026, month: 5 });
  assert.equal(parseCollectionMonthKey("2026-13"), null);

  const presets = buildCollectionMonthlyComparisonPresetRanges(new Date("2026-05-20T00:00:00.000Z"));
  assert.deepEqual(presets.map((preset) => preset.label), [
    "Last 3 months",
    "Last 6 months",
    "Year to date",
    "Previous year",
  ]);
  assert.deepEqual(presets[0], {
    id: "last-3",
    label: "Last 3 months",
    startMonth: "2026-03",
    endMonth: "2026-05",
  });
});

test("collection monthly comparison helpers format difference, percentage, and accessible summaries clearly", () => {
  assert.match(formatCollectionMonthlyComparisonDifference(12450), /^\+RM(?:\u00A0| )12,450\.00$/);
  assert.match(formatCollectionMonthlyComparisonDifference(-5200), /^-RM(?:\u00A0| )5,200\.00$/);
  assert.equal(formatCollectionMonthlyComparisonDifference(null), "N/A");
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

test("collection monthly comparison helpers derive operational insights", () => {
  const insights = buildCollectionMonthlyComparisonInsights(comparisonPayload);

  assert.equal(insights.rangeTotal, 153350);
  assert.equal(insights.totalRecords, 269);
  assert.equal(insights.activeMonthCount, 2);
  assert.equal(insights.emptyMonthCount, 0);
  assert.equal(insights.peakMonth?.month, "2026-05");
  assert.equal(insights.lowestActiveMonth?.month, "2026-04");
  assert.equal(insights.strongestIncreaseMonth?.month, "2026-05");
  assert.equal(insights.strongestDecreaseMonth, null);
  assert.equal(insights.anomalyMonthCount, 0);
  assert.equal(insights.monthInsights[0]?.deltaFromPrevious, null);
  assert.equal(insights.monthInsights[1]?.deltaFromPrevious, 12450);
  assert.equal(insights.monthInsights[1]?.isTargetMonth, true);
});

test("collection monthly comparison helpers flag month-to-month anomalies above threshold", () => {
  const insights = buildCollectionMonthlyComparisonInsights(anomalyPayload);

  assert.equal(COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT, 30);
  assert.equal(insights.anomalyMonthCount, 1);
  assert.equal(insights.anomalyMonths[0]?.month, "2026-05");
  assert.equal(insights.monthInsights[1]?.isAnomaly, true);
  assert.equal(insights.monthInsights[1]?.anomalyDirection, "increase");
  assert.equal(insights.monthInsights[1]?.anomalyMagnitudePercent?.toFixed(2), "34.85");
  assert.match(insights.monthInsights[1]?.anomalyLabel || "", /Unusual jump \+34\.85%/);

  const csv = buildCollectionMonthlyComparisonCsv(anomalyPayload, 80000);
  assert.match(csv, /"Anomaly Status","Anomaly Direction","Anomaly Threshold Percent"/);
  assert.match(csv, /"Unusual jump \+34\.85% vs previous month","increase","30\.00"/);
});

test("collection monthly comparison helpers explain trend direction and average movement", () => {
  const explanation = buildCollectionMonthlyComparisonTrendExplanation(comparisonPayload);

  assert.match(explanation, /May 2026 increased 17\.67%/);
  assert.match(explanation, /versus Apr 2026/);
  assert.match(explanation, /but average per record dipped slightly by RM(?:\u00A0| )4\.95\./);
});

test("collection monthly comparison helpers summarize targets and export CSV", () => {
  const targetSummary = buildCollectionMonthlyComparisonTargetSummary(comparisonPayload, 80000);
  assert.equal(targetSummary?.rangeTarget, 160000);
  assert.equal(targetSummary?.targetGap, -6650);
  assert.equal(targetSummary?.monthsAtOrAboveTarget, 1);
  assert.equal(targetSummary?.monthsBelowTarget, 1);

  const csv = buildCollectionMonthlyComparisonCsv(comparisonPayload, 80000);
  assert.match(csv, /"Nickname","Month","Month Label"/);
  assert.match(csv, /"Collector Alpha","2026-04","Apr 2026","70450\.00"/);
  assert.match(csv, /"80000\.00","-9550\.00","Below target"/);
  assert.match(csv, /"80000\.00","2900\.00","At or above target"/);
  assert.equal(
    buildCollectionMonthlyComparisonCsvFilename(comparisonPayload),
    "SQR-monthly-comparison-collector-alpha-2026-04-to-2026-05.csv",
  );
});

test("collection monthly comparison helpers build a print-friendly report with chart, target, and anomaly details", () => {
  const html = buildCollectionMonthlyComparisonPrintReportHtml(anomalyPayload, {
    monthlyTargetAmount: 80000,
    monthlyTargetSourceLabel: "May 2026",
    generatedAt: new Date("2026-05-08T09:30:00.000Z"),
  });

  assert.match(html, /Monthly Collection Comparison/);
  assert.match(html, /Collector Alpha/);
  assert.match(html, /role="img" aria-label="Monthly comparison bar chart"/);
  assert.match(html, /Monthly target/);
  assert.match(html, /Target source: May 2026/);
  assert.match(html, /Unusual jump \+34\.85% vs previous month/);
  assert.match(html, /Print or save PDF/);
  assert.match(html, /window\.print/);
});
