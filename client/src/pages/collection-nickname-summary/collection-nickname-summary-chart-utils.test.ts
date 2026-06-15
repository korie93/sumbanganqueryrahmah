import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionNicknameSummaryChartData,
  getCollectionNicknameSummaryChartPeak,
  hasCollectionNicknameSummaryChartData,
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
  assert.deepEqual(chartData.map((row) => row.percentage), [75, 25]);
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
