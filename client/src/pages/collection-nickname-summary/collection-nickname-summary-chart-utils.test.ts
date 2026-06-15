import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionNicknameSummaryChartData,
  filterCollectionNicknameSummaryChartData,
  getCollectionNicknamePerformanceLabel,
  getCollectionNicknamePerformanceLevel,
  getCollectionNicknameSummaryChartPeak,
  hasCollectionNicknameSummaryChartData,
  rankCollectionNicknameSummaryChartData,
  truncateNicknameChartLabel,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import type { NicknameTotalSummary } from "@/pages/collection-nickname-summary/utils";

test("buildCollectionNicknameSummaryChartData preserves table order and calculates shares", () => {
  const rows: NicknameTotalSummary[] = [
    { nickname: "Collector Alpha", totalAmount: 750, totalRecords: 3 },
    { nickname: "Collector Beta", totalAmount: 250, totalRecords: 1 },
  ];
  const before = structuredClone(rows);

  const chartData = buildCollectionNicknameSummaryChartData(rows, 1_000);

  assert.deepEqual(rows, before);
  assert.deepEqual(chartData.map((row) => row.nickname), ["Collector Alpha", "Collector Beta"]);
  assert.deepEqual(chartData.map((row) => row.totalAmount), [750, 250]);
  assert.deepEqual(chartData.map((row) => row.totalRecords), [3, 1]);
  assert.deepEqual(chartData.map((row) => row.averagePerRecord), [250, 250]);
  assert.deepEqual(chartData.map((row) => row.percentage), [75, 25]);
  assert.deepEqual(chartData.map((row) => row.color), [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
  ]);
  assert.equal(hasCollectionNicknameSummaryChartData(chartData), true);
  assert.equal(getCollectionNicknameSummaryChartPeak(chartData)?.nickname, "Collector Alpha");
});

test("buildCollectionNicknameSummaryChartData handles zero and invalid values safely", () => {
  const chartData = buildCollectionNicknameSummaryChartData([
    { nickname: "  ", totalAmount: Number.NaN, totalRecords: -2 },
    { nickname: "Collector Beta", totalAmount: -50, totalRecords: 4.9 },
  ], 0);

  assert.deepEqual(chartData.map((row) => row.nickname), [
    "Unknown / No Nickname",
    "Collector Beta",
  ]);
  assert.deepEqual(chartData.map((row) => row.totalAmount), [0, 0]);
  assert.deepEqual(chartData.map((row) => row.totalRecords), [0, 4]);
  assert.deepEqual(chartData.map((row) => row.percentage), [0, 0]);
  assert.equal(hasCollectionNicknameSummaryChartData(chartData), false);
  assert.equal(getCollectionNicknameSummaryChartPeak(chartData), null);
});

test("buildCollectionNicknameSummaryChartData falls back to row totals for percentages", () => {
  const chartData = buildCollectionNicknameSummaryChartData([
    { nickname: "Alpha", totalAmount: 60, totalRecords: 2 },
    { nickname: "Beta", totalAmount: 40, totalRecords: 1 },
  ], Number.NaN);

  assert.deepEqual(chartData.map((row) => row.percentage), [60, 40]);
});

test("buildCollectionNicknameSummaryChartData keeps mobile axis labels compact", () => {
  const chartData = buildCollectionNicknameSummaryChartData([
    { nickname: "SW.AFIQAH_1242", totalAmount: 100, totalRecords: 1 },
    { nickname: "SW.BUKHARI_924", totalAmount: 200, totalRecords: 1 },
  ], 300);

  assert.deepEqual(chartData.map((row) => row.axisLabel), [
    "AFIQAH_1242",
    "BUKHARI_924",
  ]);
  assert.deepEqual(chartData.map((row) => row.nickname), [
    "SW.AFIQAH_1242",
    "SW.BUKHARI_924",
  ]);
});

test("truncateNicknameChartLabel preserves short labels and truncates long labels", () => {
  assert.equal(truncateNicknameChartLabel("Collector A"), "Collector A");
  assert.equal(
    truncateNicknameChartLabel("Collector With A Very Long Operational Nickname"),
    "Collector With...",
  );
});

test("buildCollectionNicknameSummaryChartData handles nullish input", () => {
  assert.deepEqual(buildCollectionNicknameSummaryChartData(null, 0), []);
  assert.deepEqual(buildCollectionNicknameSummaryChartData(undefined, 0), []);
});

test("buildCollectionNicknameSummaryChartData rotates the fixed theme-aware palette", () => {
  const chartData = buildCollectionNicknameSummaryChartData(
    Array.from({ length: 6 }, (_, index) => ({
      nickname: `Collector ${index + 1}`,
      totalAmount: 100 + index,
      totalRecords: 1,
    })),
    615,
  );

  assert.equal(new Set(chartData.slice(0, 5).map((row) => row.color)).size, 5);
  assert.equal(chartData[5]?.color, chartData[0]?.color);
});

test("rankCollectionNicknameSummaryChartData ranks amount, records, then nickname", () => {
  const chartData = buildCollectionNicknameSummaryChartData([
    { nickname: "Collector Charlie", totalAmount: 300, totalRecords: 1 },
    { nickname: "Collector Beta", totalAmount: 500, totalRecords: 2 },
    { nickname: "Collector Alpha", totalAmount: 500, totalRecords: 2 },
    { nickname: "Collector Delta", totalAmount: 500, totalRecords: 1 },
  ], 1_800);

  assert.deepEqual(
    rankCollectionNicknameSummaryChartData(chartData).map((row) => row.nickname),
    ["Collector Alpha", "Collector Beta", "Collector Delta", "Collector Charlie"],
  );
});

test("filterCollectionNicknameSummaryChartData searches, sorts, limits, and preserves input", () => {
  const chartData = buildCollectionNicknameSummaryChartData([
    { nickname: "Collector Alpha", totalAmount: 300, totalRecords: 3 },
    { nickname: "Collector Beta", totalAmount: 500, totalRecords: 1 },
    { nickname: "Alpha Support", totalAmount: 200, totalRecords: 4 },
    { nickname: "Collector Delta", totalAmount: 100, totalRecords: 2 },
  ], 1_100);
  const before = structuredClone(chartData);

  const byRecords = filterCollectionNicknameSummaryChartData(chartData, {
    limit: "all",
    query: " alpha ",
    sortBy: "records",
  });
  const topTwoByAverage = filterCollectionNicknameSummaryChartData(chartData, {
    limit: "5",
    query: "",
    sortBy: "average",
  }).slice(0, 2);

  assert.deepEqual(byRecords.map((row) => row.nickname), ["Alpha Support", "Collector Alpha"]);
  assert.deepEqual(topTwoByAverage.map((row) => row.nickname), ["Collector Beta", "Collector Alpha"]);
  assert.deepEqual(chartData, before);
});

test("performance levels use explicit relative thresholds and labels", () => {
  assert.equal(getCollectionNicknamePerformanceLevel({ totalAmount: 1_000 }, 1_000), "high");
  assert.equal(getCollectionNicknamePerformanceLevel({ totalAmount: 670 }, 1_000), "high");
  assert.equal(getCollectionNicknamePerformanceLevel({ totalAmount: 500 }, 1_000), "medium");
  assert.equal(getCollectionNicknamePerformanceLevel({ totalAmount: 200 }, 1_000), "low");
  assert.equal(getCollectionNicknamePerformanceLevel({ totalAmount: 0 }, 0), "low");
  assert.equal(getCollectionNicknamePerformanceLabel("high"), "Tinggi");
  assert.equal(getCollectionNicknamePerformanceLabel("medium"), "Sederhana");
  assert.equal(getCollectionNicknamePerformanceLabel("low"), "Rendah");
});
