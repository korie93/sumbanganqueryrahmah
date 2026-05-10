import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import {
  COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT,
  buildCollectionSameDayPaceComparison,
  buildCollectionMonthlyComparisonAccessibleSummary,
  buildCollectionMonthlyComparisonBenchmarks,
  buildCollectionMonthlyComparisonCsv,
  buildCollectionMonthlyComparisonCsvFilename,
  buildCollectionMonthlyComparisonDataQualitySummary,
  buildCollectionMonthlyComparisonInsights,
  buildCollectionMonthlyComparisonPrintReportHtml,
  buildCollectionMonthlyComparisonPresetRanges,
  buildCollectionMonthlyComparisonProjection,
  buildCollectionMonthlyComparisonTargetSummary,
  buildCollectionMonthlyComparisonTrendExplanation,
  buildCollectionSameDayPaceDayOptions,
  buildCollectionSameDayPaceQuickOptions,
  buildCollectionSameDayPacePointInsights,
  buildCollectionSameDayPacePointTrendLabel,
  formatCollectionSameDayPaceDisplayDate,
  buildDefaultCollectionMonthlyComparisonRange,
  countCollectionMonthsInclusive,
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonPercentage,
  normalizeCollectionMonthInputValue,
  normalizeCollectionSameDayPaceDayRange,
  parseCollectionMonthKey,
  resolveCollectionSameDayPaceComparisonMonthKey,
  resolveCollectionSameDayPaceMaxDay,
  resolveCollectionSameDayPaceRangeForSelection,
  resolveCollectionSameDayPaceWindowMode,
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

const benchmarkPayload: CollectionMonthlyComparisonResponse = {
  ok: true,
  nickname: "Collector Alpha",
  startMonth: "2025-05",
  endMonth: "2026-05",
  months: [
    {
      month: "2025-05",
      label: "May 2025",
      totalCollection: 60000,
      recordCount: 100,
      averagePerRecord: 600,
    },
    {
      month: "2026-02",
      label: "Feb 2026",
      totalCollection: 70000,
      recordCount: 115,
      averagePerRecord: 608.7,
    },
    {
      month: "2026-03",
      label: "Mar 2026",
      totalCollection: 75000,
      recordCount: 125,
      averagePerRecord: 600,
    },
    {
      month: "2026-04",
      label: "Apr 2026",
      totalCollection: 80000,
      recordCount: 130,
      averagePerRecord: 615.38,
    },
    {
      month: "2026-05",
      label: "May 2026",
      totalCollection: 90000,
      recordCount: 150,
      averagePerRecord: 600,
    },
  ],
  comparison: {
    baseMonth: "2026-04",
    targetMonth: "2026-05",
    baseLabel: "Apr 2026",
    targetLabel: "May 2026",
    baseTotal: 80000,
    targetTotal: 90000,
    difference: 10000,
    percentageChange: 12.5,
    direction: "increase",
    summary: "Collection increased by RM10,000.00 (+12.50%) compared to Apr 2026.",
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
  assert.equal(normalizeCollectionMonthInputValue("2026-5"), "2026-05");
  assert.equal(normalizeCollectionMonthInputValue(" 2026-12 "), "2026-12");
  assert.equal(normalizeCollectionMonthInputValue("2026-13"), null);

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

test("collection same-day pace compares the full comparable selected month range by default", () => {
  const pace = buildCollectionSameDayPaceComparison({
    currentMonthKey: "2026-05",
    currentDaily: [1000, 2000, 1500, 1300, 1200, 1400, 1600, 1000, 2000]
      .map((amount, index) => ({ day: index + 1, amount })),
    previousDaily: [2000, 2200, 2100, 2000, 2300, 2200, 2100, 2000, 2100]
      .map((amount, index) => ({ day: index + 1, amount })),
    monthlyTargetAmount: 50000,
    referenceDate: new Date(2026, 4, 9, 12),
  });

  assert.ok(pace);
  assert.equal(pace.currentMonth, "2026-05");
  assert.equal(pace.previousMonth, "2026-04");
  assert.equal(pace.comparisonDay, 30);
  assert.equal(pace.comparedDayCount, 30);
  assert.equal(pace.points.length, 30);
  assert.equal(pace.currentTotal, 13000);
  assert.equal(pace.previousTotal, 19000);
  assert.equal(pace.difference, -6000);
  assert.equal(pace.direction, "slower");
  assert.equal(pace.percentageChange?.toFixed(2), "-31.58");
  assert.equal(pace.currentDailyAverage.toFixed(2), "433.33");
  assert.equal(pace.previousDailyAverage.toFixed(2), "633.33");
  assert.equal(pace.target?.status, "behind");
  assert.equal(pace.target?.paceGap.toFixed(2), "-35387.10");
  assert.match(pace.headline, /31\.6% slower than previous month/);
  assert.match(pace.insights[0] || "", /RM(?:\u00A0| )6,000\.00 less/);
  assert.equal(pace.points[8]?.currentCumulative, 13000);
  assert.equal(pace.points[8]?.previousCumulative, 19000);
  assert.equal(pace.points[29]?.currentCumulative, 13000);
  assert.equal(pace.points[29]?.previousCumulative, 19000);
  assert.equal(formatCollectionSameDayPaceDisplayDate(pace.points[3]?.currentDate || ""), "4 May 2026");
  assert.equal(
    buildCollectionSameDayPacePointTrendLabel(pace.points[3]!),
    "Daily collection slower but cumulative behind",
  );
  assert.match(
    buildCollectionSameDayPacePointInsights(pace.points[3]!, pace)[0] || "",
    /Collection on 4 May 2026 was RM(?:\u00A0| )700\.00 lower than 4 April 2026\./,
  );

  const csv = buildCollectionMonthlyComparisonCsv(comparisonPayload, {
    monthlyTargetAmount: 50000,
    sameDayPace: pace,
  });
  assert.match(csv, /"Same-Day Pace Detail"/);
  assert.match(csv, /"Date","Month","Daily Collection","Cumulative Collection","Previous Month Date"/);
  assert.match(csv, /"Workday\/Holiday Status","Previous Workday\/Holiday Status","Pace Status","Pace Insight"/);
  assert.match(csv, /"2026-05-04","May 2026","1300\.00","5800\.00","2026-04-04","April 2026","2000\.00","8300\.00","-700\.00","-2500\.00","50000\.00","","11\.60","Calendar not configured","Calendar not configured","Daily collection slower but cumulative behind"/);
});

test("collection same-day compare-day helpers normalize dropdown ranges and baselines safely", () => {
  assert.equal(resolveCollectionSameDayPaceComparisonMonthKey({
    currentMonthKey: "2026-05",
    selectedBaseMonthKey: "2026-04",
    comparisonMode: "selected-start-month",
  }), "2026-04");
  assert.equal(resolveCollectionSameDayPaceComparisonMonthKey({
    currentMonthKey: "2026-01",
    comparisonMode: "previous-month",
  }), "2025-12");
  assert.equal(resolveCollectionSameDayPaceComparisonMonthKey({
    currentMonthKey: "2026-05",
    comparisonMode: "previous-year",
  }), "2025-05");
  assert.equal(resolveCollectionSameDayPaceMaxDay({
    currentMonthKey: "2026-03",
    comparisonMonthKey: "2026-02",
  }), 28);
  assert.deepEqual(normalizeCollectionSameDayPaceDayRange({ startDay: 40, endDay: 2 }, 31), {
    startDay: 2,
    endDay: 31,
  });
  assert.deepEqual(resolveCollectionSameDayPaceRangeForSelection({
    day: 9,
    maxDay: 31,
    windowMode: "cumulative",
  }), {
    startDay: 1,
    endDay: 9,
  });
  assert.deepEqual(resolveCollectionSameDayPaceRangeForSelection({
    day: 9,
    maxDay: 31,
    windowMode: "single-day",
  }), {
    startDay: 9,
    endDay: 9,
  });
  assert.equal(resolveCollectionSameDayPaceWindowMode({ startDay: 4, endDay: 9 }), "custom-range");
  assert.equal(buildCollectionSameDayPaceDayOptions(31).length, 31);
});

test("collection same-day quick presets select last, best, and weakest active days", () => {
  const options = buildCollectionSameDayPaceQuickOptions({
    maxDay: 31,
    points: [
      { day: 1, currentAmount: 0 },
      { day: 2, currentAmount: 100 },
      { day: 3, currentAmount: 500 },
      { day: 4, currentAmount: 50 },
    ],
  });

  const lastCollectionDay = options.find((option) => option.id === "last-collection-day");
  const bestDay = options.find((option) => option.id === "best-current-day");
  const weakestDay = options.find((option) => option.id === "weakest-current-day");

  assert.deepEqual(lastCollectionDay?.range, { startDay: 1, endDay: 4 });
  assert.deepEqual(bestDay?.range, { startDay: 3, endDay: 3 });
  assert.deepEqual(weakestDay?.range, { startDay: 4, endDay: 4 });
  assert.equal(bestDay?.windowMode, "single-day");
  assert.equal(options.find((option) => option.id === "same-day-previous-year")?.comparisonMode, "previous-year");
});

test("collection same-day pace supports custom selected day ranges and calendar-aware insight", () => {
  const currentDaily = Array.from({ length: 20 }, (_, index) => ({
    day: index + 1,
    amount: index + 1 === 20 ? 2500 : 1000,
    isWorkingDay: true,
    isHoliday: false,
    holidayName: null,
  }));
  const previousDaily = Array.from({ length: 20 }, (_, index) => ({
    day: index + 1,
    amount: index + 1 === 20 ? 0 : 800,
    isWorkingDay: index + 1 !== 20,
    isHoliday: index + 1 === 20,
    holidayName: index + 1 === 20 ? "Public Holiday" : null,
  }));
  const pace = buildCollectionSameDayPaceComparison({
    currentMonthKey: "2026-05",
    previousMonthKey: "2026-04",
    currentDaily,
    previousDaily,
    monthlyTargetAmount: 110000,
    previousMonthlyTargetAmount: 100000,
    dayRange: {
      startDay: 5,
      endDay: 20,
    },
    referenceDate: new Date(2026, 4, 31, 12),
  });

  assert.ok(pace);
  assert.equal(pace.startDay, 5);
  assert.equal(pace.endDay, 20);
  assert.equal(pace.comparedDayCount, 16);
  assert.equal(pace.points[0]?.day, 5);
  assert.equal(pace.points[0]?.rangeIndex, 1);
  assert.equal(pace.currentTotal, 17500);
  assert.equal(pace.previousTotal, 12000);
  assert.equal(pace.previousMonthlyTargetAmount, 100000);
  assert.match(pace.currentRangeLabel, /May 5 to May 20, 2026/);
  assert.match(pace.previousRangeLabel, /April 5 to April 20, 2026/);
  assert.equal(pace.points[15]?.previousStatus.label, "Holiday / non-working (Public Holiday)");
  assert.match(
    buildCollectionSameDayPacePointInsights(pace.points[15]!, pace).join(" "),
    /20 April 2026 was marked as holiday \/ non-working/,
  );
  assert.match(pace.insights.join(" "), /20 April 2026 was holiday\/non-working while 20 May 2026 was a working day/);
});

test("collection same-day pace handles January rollover and short previous months safely", () => {
  const januaryPace = buildCollectionSameDayPaceComparison({
    currentMonthKey: "2026-01",
    currentDaily: Array.from({ length: 8 }, (_, index) => ({ day: index + 1, amount: 1000 })),
    previousDaily: Array.from({ length: 8 }, (_, index) => ({ day: index + 1, amount: 900 })),
    referenceDate: new Date(2026, 0, 8, 12),
  });

  assert.ok(januaryPace);
  assert.equal(januaryPace.previousMonth, "2025-12");
  assert.equal(januaryPace.comparisonDay, 31);
  assert.match(januaryPace.previousRangeLabel, /December 1 to December 31, 2025/);

  const cappedPace = buildCollectionSameDayPaceComparison({
    currentMonthKey: "2026-03",
    currentDaily: Array.from({ length: 31 }, (_, index) => ({ day: index + 1, amount: 100 })),
    previousDaily: Array.from({ length: 28 }, (_, index) => ({ day: index + 1, amount: 100 })),
    referenceDate: new Date(2026, 2, 31, 12),
  });

  assert.ok(cappedPace);
  assert.equal(cappedPace.previousMonth, "2026-02");
  assert.equal(cappedPace.comparisonDay, 28);
  assert.equal(cappedPace.rangeCappedByPreviousMonth, true);
  assert.match(cappedPace.insights[cappedPace.insights.length - 1] || "", /fewer calendar days/);
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
  assert.match(csv, /"80000\.00","-9550\.00","88\.06","Below target"/);
  assert.match(csv, /"80000\.00","2900\.00","103\.62","At or above target"/);
  assert.equal(
    buildCollectionMonthlyComparisonCsvFilename(comparisonPayload),
    "SQR-monthly-comparison-collector-alpha-2026-04-to-2026-05.csv",
  );
});

test("collection monthly comparison helpers keep month-specific targets synchronized", () => {
  const targetsByMonth = {
    "2026-04": 150000,
    "2026-05": 110000,
  };
  const targetSummary = buildCollectionMonthlyComparisonTargetSummary(comparisonPayload, targetsByMonth);

  assert.equal(targetSummary?.monthlyTargetAmount, 110000);
  assert.equal(targetSummary?.rangeTarget, 260000);
  assert.equal(targetSummary?.targetGap, -106650);
  assert.equal(targetSummary?.configuredMonthCount, 2);
  assert.equal(targetSummary?.missingMonthCount, 0);

  const csv = buildCollectionMonthlyComparisonCsv(comparisonPayload, {
    monthlyTargetsByMonth: targetsByMonth,
  });
  assert.match(csv, /"2026-04","Apr 2026","70450\.00".*"150000\.00","-79550\.00","46\.97","Below target"/);
  assert.match(csv, /"2026-05","May 2026","82900\.00".*"110000\.00","-27100\.00","75\.36","Below target"/);
});

test("collection monthly comparison helpers build benchmark lenses from available range data", () => {
  const benchmarks = buildCollectionMonthlyComparisonBenchmarks(benchmarkPayload);
  const previousMonth = benchmarks.find((benchmark) => benchmark.id === "previous-month");
  const lastYear = benchmarks.find((benchmark) => benchmark.id === "same-month-last-year");
  const previousThreeAverage = benchmarks.find((benchmark) => benchmark.id === "previous-3-average");
  const rangeAverage = benchmarks.find((benchmark) => benchmark.id === "range-average");

  assert.equal(benchmarks.length, 4);
  assert.equal(previousMonth?.available, true);
  assert.equal(previousMonth?.difference, 10000);
  assert.equal(previousMonth?.percentageChange, 12.5);
  assert.equal(lastYear?.referenceLabel, "May 2025");
  assert.equal(lastYear?.difference, 30000);
  assert.equal(lastYear?.percentageChange, 50);
  assert.equal(previousThreeAverage?.referenceTotal, 75000);
  assert.equal(previousThreeAverage?.difference, 15000);
  assert.equal(rangeAverage?.referenceTotal, 71250);
  assert.equal(rangeAverage?.difference, 18750);

  const limitedBenchmarks = buildCollectionMonthlyComparisonBenchmarks(comparisonPayload);
  assert.equal(
    limitedBenchmarks.find((benchmark) => benchmark.id === "same-month-last-year")?.available,
    false,
  );
});

test("collection monthly comparison helpers project current month pace and quality checks", () => {
  const referenceDate = new Date(2026, 4, 9, 12);
  const projection = buildCollectionMonthlyComparisonProjection(
    comparisonPayload,
    80000,
    referenceDate,
  );

  assert.equal(projection?.month, "2026-05");
  assert.equal(projection?.elapsedDays, 9);
  assert.equal(projection?.totalDays, 31);
  assert.equal(projection?.remainingDays, 22);
  assert.equal(projection?.status, "on_track");
  assert.equal(projection?.projectedTotal.toFixed(2), "285544.44");
  assert.equal(projection?.targetGap?.toFixed(2), "205544.44");

  const qualitySummary = buildCollectionMonthlyComparisonDataQualitySummary(
    anomalyPayload,
    80000,
    referenceDate,
  );
  assert.equal(qualitySummary.statusLabel, "1 item needs review");
  assert.equal(qualitySummary.statusTone, "warning");
  assert.ok(qualitySummary.signals.some((signal) => signal.id === "target-configured"));
  assert.ok(qualitySummary.signals.some((signal) => signal.id === "anomaly-months"));
  assert.ok(qualitySummary.signals.some((signal) => signal.id === "projection-on-track"));

  const missingTargetQuality = buildCollectionMonthlyComparisonDataQualitySummary(
    comparisonPayload,
    null,
    referenceDate,
  );
  assert.ok(missingTargetQuality.signals.some((signal) => signal.id === "target-missing"));
});

test("collection monthly comparison helpers build a print-friendly report with chart, target, and anomaly details", () => {
  const sameDayPace = buildCollectionSameDayPaceComparison({
    currentMonthKey: "2026-05",
    currentDaily: [1000, 2000, 1500, 1300, 1200, 1400, 1600, 1000, 2000]
      .map((amount, index) => ({ day: index + 1, amount })),
    previousDaily: [2000, 2200, 2100, 2000, 2300, 2200, 2100, 2000, 2100]
      .map((amount, index) => ({ day: index + 1, amount })),
    monthlyTargetAmount: 50000,
    referenceDate: new Date(2026, 4, 9, 12),
  });
  const html = buildCollectionMonthlyComparisonPrintReportHtml(anomalyPayload, {
    monthlyTargetAmount: 80000,
    monthlyTargetSourceLabel: "May 2026",
    sameDayPace,
    generatedAt: new Date(2026, 4, 8, 17, 30),
  });

  assert.match(html, /Monthly Collection Comparison/);
  assert.match(html, /Collector Alpha/);
  assert.match(html, /role="img" aria-label="Monthly comparison bar chart"/);
  assert.match(html, /Monthly target/);
  assert.match(html, /Target source: May 2026/);
  assert.match(html, /Benchmark lens/);
  assert.match(html, /Same-day pace/);
  assert.match(html, /31\.6% slower than previous month/);
  assert.match(html, /Current month projection/);
  assert.match(html, /Data quality checks/);
  assert.match(html, /Unusual jump \+34\.85% vs previous month/);
  assert.match(html, /Print or save PDF/);
  assert.match(html, /window\.print/);
});
