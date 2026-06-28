import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionNicknameSummaryMetricData,
  formatCollectionNicknameChartMetricAxis,
  getCollectionNicknameChartMetricName,
  summarizeCollectionNicknameTargetOutcomes,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-metrics";
import {
  buildCollectionNicknameSummaryChartData,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import {
  normalizeCollectionNicknameTargetKey,
  type CollectionNicknameTargetBenchmark,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";

function createBenchmark(
  amount: number,
  configuredMonths = 1,
  requestedMonths = 1,
): CollectionNicknameTargetBenchmark {
  return {
    amount,
    configuredMonths,
    latestUpdatedAt: null,
    latestUpdatedBy: null,
    missingMonths: Math.max(0, requestedMonths - configuredMonths),
    months: [],
    requestedMonths,
  };
}

const chartRows = buildCollectionNicknameSummaryChartData([
  { nickname: "Collector Alpha", totalAmount: 750, totalRecords: 3 },
  { nickname: "Collector Beta", totalAmount: 250, totalRecords: 1 },
  { nickname: "Collector Incomplete", totalAmount: 900, totalRecords: 2 },
], 1_900);
const targetBenchmarks = new Map<string, CollectionNicknameTargetBenchmark>([
  [normalizeCollectionNicknameTargetKey("Collector Alpha"), createBenchmark(1_000)],
  [normalizeCollectionNicknameTargetKey("Collector Beta"), createBenchmark(200)],
  [normalizeCollectionNicknameTargetKey("Collector Incomplete"), createBenchmark(2_000, 1, 2)],
]);

test("nickname chart metrics calculate amount, progress, and target gap consistently", () => {
  const amountRows = buildCollectionNicknameSummaryMetricData(
    chartRows,
    targetBenchmarks,
    "amount",
  );
  const progressRows = buildCollectionNicknameSummaryMetricData(
    chartRows,
    targetBenchmarks,
    "progress",
  );
  const gapRows = buildCollectionNicknameSummaryMetricData(
    chartRows,
    targetBenchmarks,
    "gap",
  );

  assert.deepEqual(amountRows.map((row) => row.chartValue), [750, 250, 900]);
  assert.deepEqual(progressRows.map((row) => row.chartValue), [75, 125, 0]);
  assert.deepEqual(progressRows.map((row) => row.chartLabel), ["75.0%", "125.0%", "Tiada target"]);
  assert.deepEqual(gapRows.map((row) => row.chartValue), [250, 0, 0]);
  assert.deepEqual(gapRows.map((row) => row.chartLabel), ["RM 250", "Capai", "Tiada target"]);
  assert.equal(progressRows[2]?.targetAmount, null);
});

test("nickname chart metric labels and axes describe the active mode", () => {
  assert.equal(getCollectionNicknameChartMetricName("amount"), "Jumlah kutipan");
  assert.equal(getCollectionNicknameChartMetricName("progress"), "Progress target");
  assert.equal(getCollectionNicknameChartMetricName("gap"), "Jurang target");
  assert.equal(formatCollectionNicknameChartMetricAxis(87.6, "progress"), "88%");
  assert.equal(formatCollectionNicknameChartMetricAxis(1_250, "gap"), "RM 1.3K");
});

test("nickname target outcome summary counts only complete targets as evaluated", () => {
  const rows = buildCollectionNicknameSummaryChartData([
    { nickname: "Achieved", totalAmount: 100, totalRecords: 1 },
    { nickname: "Near", totalAmount: 85, totalRecords: 1 },
    { nickname: "Behind", totalAmount: 50, totalRecords: 1 },
    { nickname: "Incomplete", totalAmount: 500, totalRecords: 1 },
    { nickname: "Not Set", totalAmount: 500, totalRecords: 1 },
  ], 1_235);
  const benchmarks = new Map<string, CollectionNicknameTargetBenchmark>([
    [normalizeCollectionNicknameTargetKey("Achieved"), createBenchmark(100)],
    [normalizeCollectionNicknameTargetKey("Near"), createBenchmark(100)],
    [normalizeCollectionNicknameTargetKey("Behind"), createBenchmark(100)],
    [normalizeCollectionNicknameTargetKey("Incomplete"), createBenchmark(100, 1, 2)],
  ]);

  assert.deepEqual(summarizeCollectionNicknameTargetOutcomes(rows, benchmarks), {
    achievedCount: 1,
    behindCount: 1,
    completeCount: 3,
    configuredCount: 4,
    incompleteCount: 1,
    nearCount: 1,
    notEvaluatedCount: 2,
  });
});
