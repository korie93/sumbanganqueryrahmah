import { formatCollectionMonthlyComparisonPercentage } from "./collection-monthly-format-utils";

export const COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT = 30;

export type CollectionMonthlyComparisonAnomalyDirection = "increase" | "decrease";

export function resolveCollectionMonthlyComparisonAnomaly(
  difference: number | null,
  percentage: number | null,
) {
  const anomalyMagnitudePercent = percentage === null ? null : Math.abs(percentage);
  const isAnomaly =
    difference !== null
    && difference !== 0
    && anomalyMagnitudePercent !== null
    && anomalyMagnitudePercent > COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT;
  const anomalyDirection: CollectionMonthlyComparisonAnomalyDirection | null = isAnomaly
    ? difference > 0 ? "increase" : "decrease"
    : null;
  const anomalyLabel = isAnomaly && anomalyDirection
    ? `${anomalyDirection === "increase" ? "Unusual jump" : "Unusual drop"} ${formatCollectionMonthlyComparisonPercentage(percentage)} vs previous month`
    : null;

  return {
    isAnomaly,
    anomalyDirection,
    anomalyMagnitudePercent,
    anomalyLabel,
  };
}
