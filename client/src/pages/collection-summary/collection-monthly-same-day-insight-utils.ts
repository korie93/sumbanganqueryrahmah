import { formatAmountRM } from "@/pages/collection/utils";
import { formatCollectionSameDayPaceDisplayDate } from "./collection-monthly-format-utils";
import type { CollectionSameDayPaceComparison, CollectionSameDayPacePoint } from "./collection-monthly-same-day-types";

export function buildCollectionSameDayPacePointTrendLabel(
  point: CollectionSameDayPacePoint,
): string {
  const dailyLabel = point.dailyDifference < 0
    ? "Daily collection slower"
    : point.dailyDifference > 0 ? "Daily collection stronger" : "Daily collection matched";
  const cumulativeLabel = point.cumulativeDifference < 0
    ? "cumulative behind"
    : point.cumulativeDifference > 0 ? "cumulative ahead" : "cumulative level";

  return `${dailyLabel} but ${cumulativeLabel}`;
}

export function buildCollectionSameDayPacePointInsights(
  point: CollectionSameDayPacePoint,
  pace?: CollectionSameDayPaceComparison | null,
): string[] {
  const currentDate = formatCollectionSameDayPaceDisplayDate(point.currentDate);
  const previousDate = formatCollectionSameDayPaceDisplayDate(point.previousDate);
  const insights = [
    point.dailyDifference < 0
      ? `Collection on ${currentDate} was ${formatAmountRM(Math.abs(point.dailyDifference))} lower than ${previousDate}.`
      : point.dailyDifference > 0
        ? `Collection on ${currentDate} was ${formatAmountRM(Math.abs(point.dailyDifference))} higher than ${previousDate}.`
        : `Collection on ${currentDate} matched ${previousDate}.`,
    point.cumulativeDifference < 0
      ? `Cumulative collection was ${formatAmountRM(Math.abs(point.cumulativeDifference))} behind by day ${point.day}.`
      : point.cumulativeDifference > 0
        ? `Cumulative collection was ${formatAmountRM(Math.abs(point.cumulativeDifference))} ahead by day ${point.day}.`
        : `Cumulative collection was level by day ${point.day}.`,
  ];

  if (point.dailyDifference < 0 && point.cumulativeDifference > 0) {
    insights.push("Despite a slower daily result, cumulative performance remained ahead.");
  } else if (point.dailyDifference > 0 && point.cumulativeDifference < 0) {
    insights.push("The daily result improved, but cumulative performance still needs to catch up.");
  }

  if (point.previousStatus.tone === "non_working" && point.currentStatus.tone === "working") {
    insights.push(
      `${previousDate} was marked as ${point.previousStatus.label.toLowerCase()}, while ${currentDate} was a working day. This may make the current range look stronger.`,
    );
  } else if (point.currentStatus.tone === "non_working" && point.previousStatus.tone === "working") {
    insights.push(
      `${currentDate} was marked as ${point.currentStatus.label.toLowerCase()}, while ${previousDate} was a working day. This may explain a slower daily result.`,
    );
  } else if (point.currentStatus.tone === "non_working" && point.previousStatus.tone === "non_working") {
    insights.push("Both compared dates were holiday or non-working days, so daily collection may be naturally lower.");
  }

  if (pace?.target) {
    const targetProgress = point.currentCumulative / pace.target.monthlyTargetAmount;
    insights.push(`Target progress by ${currentDate}: ${(targetProgress * 100).toFixed(1)}%.`);
  }

  return insights;
}