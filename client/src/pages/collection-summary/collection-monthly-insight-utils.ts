import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

export function buildCollectionMonthlyComparisonAccessibleSummary(
  payload: CollectionMonthlyComparisonResponse,
): string {
  const monthSummaries = payload.months.map((entry) =>
    `${entry.label}: ${formatAmountRM(entry.totalCollection)} across ${entry.recordCount} record(s)`,
  );
  return `${payload.comparison.summary} Monthly totals: ${monthSummaries.join("; ")}.`;
}

export function buildCollectionMonthlyComparisonTrendExplanation(
  payload: CollectionMonthlyComparisonResponse,
): string {
  const { comparison } = payload;
  const targetMonth = payload.months.find((month) => month.month === comparison.targetMonth)
    || payload.months[payload.months.length - 1]
    || null;
  const baseMonth = comparison.baseMonth
    ? payload.months.find((month) => month.month === comparison.baseMonth) || null
    : null;

  if (!targetMonth) {
    return "No monthly trend is available for the selected range yet.";
  }

  if (!baseMonth || comparison.direction === "no_previous_data") {
    return `${targetMonth.label} recorded ${formatAmountRM(targetMonth.totalCollection)} with no previous month to compare; average per record was ${formatAmountRM(targetMonth.averagePerRecord)}.`;
  }

  const absoluteDifference = Math.abs(comparison.difference ?? 0);
  const percentageSegment = comparison.percentageChange === null
    ? "from a zero base"
    : `${Math.abs(comparison.percentageChange).toFixed(2)}%`;
  let totalTrend: string;
  if (comparison.direction === "increase") {
    totalTrend = `${targetMonth.label} increased ${percentageSegment} (${formatAmountRM(absoluteDifference)}) versus ${baseMonth.label}`;
  } else if (comparison.direction === "decrease") {
    totalTrend = `${targetMonth.label} decreased ${percentageSegment} (${formatAmountRM(absoluteDifference)}) versus ${baseMonth.label}`;
  } else {
    totalTrend = `${targetMonth.label} stayed level with ${baseMonth.label} at ${formatAmountRM(targetMonth.totalCollection)}`;
  }

  const averageDifference = targetMonth.averagePerRecord - baseMonth.averagePerRecord;
  const absoluteAverageDifference = Math.abs(averageDifference);
  let averageTrend = "average per record stayed flat";
  if (absoluteAverageDifference >= 0.005) {
    const averagePercentage = baseMonth.averagePerRecord > 0
      ? Math.abs((averageDifference / baseMonth.averagePerRecord) * 100)
      : null;
    const qualifier = averagePercentage !== null && averagePercentage < 3 ? " slightly" : "";
    averageTrend = averageDifference > 0
      ? `average per record improved${qualifier} by ${formatAmountRM(absoluteAverageDifference)}`
      : `average per record dipped${qualifier} by ${formatAmountRM(absoluteAverageDifference)}`;
  }

  const contrastConnector =
    (comparison.direction === "increase" && averageDifference < -0.005)
    || (comparison.direction === "decrease" && averageDifference > 0.005)
      ? "but"
      : "and";

  return `${totalTrend}, ${contrastConnector} ${averageTrend}.`;
}
