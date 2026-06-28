import {
  getCollectionNicknameBenchmarkGap,
  getCollectionNicknameBenchmarkProgress,
  type CollectionNicknameSummaryChartDatum,
  type CollectionNicknameSummaryChartMetric,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import {
  getCollectionNicknameTargetBenchmark,
  getCollectionNicknameTargetEvaluationAmount,
  type CollectionNicknameTargetBenchmark,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";

const COMPACT_METRIC_FORMATTER = new Intl.NumberFormat("en-MY", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export type CollectionNicknameSummaryMetricDatum = CollectionNicknameSummaryChartDatum & {
  chartLabel: string;
  chartValue: number;
  targetAmount: number | null;
};

export function formatCollectionNicknameChartMoneyCompact(value: number): string {
  return `RM ${COMPACT_METRIC_FORMATTER.format(Math.max(0, value))}`;
}

export function formatCollectionNicknameChartMetricAxis(
  value: number,
  metric: CollectionNicknameSummaryChartMetric,
): string {
  return metric === "progress"
    ? `${Math.max(0, Number(value) || 0).toFixed(0)}%`
    : formatCollectionNicknameChartMoneyCompact(value);
}

export function getCollectionNicknameChartMetricName(
  metric: CollectionNicknameSummaryChartMetric,
): string {
  if (metric === "progress") return "Progress target";
  if (metric === "gap") return "Jurang target";
  return "Jumlah kutipan";
}

export function buildCollectionNicknameSummaryMetricData(
  rows: readonly CollectionNicknameSummaryChartDatum[],
  targetBenchmarks: ReadonlyMap<string, CollectionNicknameTargetBenchmark> | undefined,
  metric: CollectionNicknameSummaryChartMetric,
): CollectionNicknameSummaryMetricDatum[] {
  return rows.map((row) => {
    const benchmark = getCollectionNicknameTargetBenchmark(targetBenchmarks, row.nickname);
    const targetAmount = getCollectionNicknameTargetEvaluationAmount(benchmark);
    const progress = getCollectionNicknameBenchmarkProgress(row, targetAmount);
    const gap = getCollectionNicknameBenchmarkGap(row, targetAmount);
    const chartValue = metric === "progress"
      ? progress
      : metric === "gap"
        ? gap
        : row.totalAmount;
    const chartLabel = metric === "progress"
      ? targetAmount > 0 ? `${Math.min(progress, 999.9).toFixed(1)}%` : "Tiada target"
      : metric === "gap"
        ? targetAmount <= 0
          ? "Tiada target"
          : gap > 0
            ? formatCollectionNicknameChartMoneyCompact(gap)
            : "Capai"
        : formatCollectionNicknameChartMoneyCompact(row.totalAmount);

    return {
      ...row,
      chartLabel,
      chartValue,
      targetAmount: targetAmount > 0 ? targetAmount : null,
    };
  });
}
