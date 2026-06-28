import {
  getCollectionNicknameBenchmarkGap,
  getCollectionNicknameBenchmarkProgress,
  getCollectionNicknameBenchmarkStatus,
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

export type CollectionNicknameTargetOutcomeSummary = {
  achievedCount: number;
  behindCount: number;
  completeCount: number;
  configuredCount: number;
  incompleteCount: number;
  nearCount: number;
  notEvaluatedCount: number;
};

export type CollectionNicknameTargetOutcomeFilter =
  | "all"
  | "achieved"
  | "near"
  | "behind"
  | "not-evaluated";

export function filterCollectionNicknameTargetOutcomes(
  rows: readonly CollectionNicknameSummaryChartDatum[],
  targetBenchmarks: ReadonlyMap<string, CollectionNicknameTargetBenchmark> | undefined,
  filter: CollectionNicknameTargetOutcomeFilter,
): CollectionNicknameSummaryChartDatum[] {
  if (filter === "all") {
    return [...rows];
  }

  return rows.filter((row) => {
    const benchmark = getCollectionNicknameTargetBenchmark(targetBenchmarks, row.nickname);
    const targetAmount = getCollectionNicknameTargetEvaluationAmount(benchmark);
    if (filter === "not-evaluated") {
      return targetAmount <= 0;
    }
    return getCollectionNicknameBenchmarkStatus(row, targetAmount) === filter;
  });
}

export function summarizeCollectionNicknameTargetOutcomes(
  rows: readonly CollectionNicknameSummaryChartDatum[],
  targetBenchmarks: ReadonlyMap<string, CollectionNicknameTargetBenchmark> | undefined,
): CollectionNicknameTargetOutcomeSummary {
  return rows.reduce<CollectionNicknameTargetOutcomeSummary>((summary, row) => {
    const benchmark = getCollectionNicknameTargetBenchmark(targetBenchmarks, row.nickname);
    const targetAmount = getCollectionNicknameTargetEvaluationAmount(benchmark);
    const status = getCollectionNicknameBenchmarkStatus(row, targetAmount);
    const complete = targetAmount > 0;

    return {
      achievedCount: summary.achievedCount + (status === "achieved" ? 1 : 0),
      behindCount: summary.behindCount + (status === "behind" ? 1 : 0),
      completeCount: summary.completeCount + (complete ? 1 : 0),
      configuredCount: summary.configuredCount + (benchmark.configuredMonths > 0 ? 1 : 0),
      incompleteCount: summary.incompleteCount + (
        benchmark.requestedMonths > 0 && !complete ? 1 : 0
      ),
      nearCount: summary.nearCount + (status === "near" ? 1 : 0),
      notEvaluatedCount: summary.notEvaluatedCount + (!complete ? 1 : 0),
    };
  }, {
    achievedCount: 0,
    behindCount: 0,
    completeCount: 0,
    configuredCount: 0,
    incompleteCount: 0,
    nearCount: 0,
    notEvaluatedCount: 0,
  });
}

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
