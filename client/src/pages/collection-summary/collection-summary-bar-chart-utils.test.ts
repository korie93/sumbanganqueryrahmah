import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionMonthlySummary } from "@/lib/api";
import {
  buildCollectionSummaryBarChartData,
  getCollectionSummaryBarChartPeakMonth,
  hasCollectionSummaryBarChartData,
} from "@/pages/collection-summary/collection-summary-bar-chart-utils";

test("buildCollectionSummaryBarChartData maps monthly summary rows without mutating input", () => {
  const rows: CollectionMonthlySummary[] = [
    { month: 2, monthName: "February", totalRecords: 7, totalAmount: 7000 },
    { month: 1, monthName: "January", totalRecords: 3, totalAmount: 1200 },
  ];
  const before = structuredClone(rows);

  const chartData = buildCollectionSummaryBarChartData(rows);

  assert.deepEqual(rows, before);
  assert.deepEqual(chartData.map((row) => row.label), ["January", "February"]);
  assert.deepEqual(chartData.map((row) => row.shortLabel), ["Jan", "Feb"]);
  assert.deepEqual(chartData.map((row) => row.totalAmount), [1200, 7000]);
  assert.deepEqual(chartData.map((row) => row.totalRecords), [3, 7]);
  assert.equal(hasCollectionSummaryBarChartData(chartData), true);
  assert.equal(getCollectionSummaryBarChartPeakMonth(chartData)?.label, "February");
});

test("buildCollectionSummaryBarChartData keeps zero months safe for empty states", () => {
  const chartData = buildCollectionSummaryBarChartData([
    { month: 1, monthName: "January", totalRecords: 0, totalAmount: 0 },
    { month: 2, monthName: "February", totalRecords: 0, totalAmount: 0 },
  ]);

  assert.equal(chartData.length, 2);
  assert.equal(chartData.every((row) => row.hasData === false), true);
  assert.equal(hasCollectionSummaryBarChartData(chartData), false);
  assert.equal(getCollectionSummaryBarChartPeakMonth(chartData), null);
});

test("buildCollectionSummaryBarChartData clamps invalid values and rejects invalid months", () => {
  const chartData = buildCollectionSummaryBarChartData([
    { month: 0, monthName: "Invalid", totalRecords: 99, totalAmount: 99 },
    { month: 3, monthName: "", totalRecords: Number.NaN, totalAmount: -500 },
    { month: 4, monthName: "April", totalRecords: 2.9, totalAmount: 2500 },
    { month: 13, monthName: "Invalid", totalRecords: 99, totalAmount: 99 },
  ]);

  assert.deepEqual(chartData.map((row) => row.label), ["Month 3", "April"]);
  assert.deepEqual(chartData.map((row) => row.totalRecords), [0, 2]);
  assert.deepEqual(chartData.map((row) => row.totalAmount), [0, 2500]);
});

test("buildCollectionSummaryBarChartData handles nullish input", () => {
  assert.deepEqual(buildCollectionSummaryBarChartData(null), []);
  assert.deepEqual(buildCollectionSummaryBarChartData(undefined), []);
});
