export type CollectionMonthlyBenchmarkDirection =
  | "increase"
  | "decrease"
  | "no_change"
  | "unavailable";

export function resolveCollectionMonthlyComparisonPercentageChange(
  currentTotal: number,
  referenceTotal: number,
): number | null {
  if (referenceTotal === 0) {
    return currentTotal === 0 ? 0 : null;
  }
  return ((currentTotal - referenceTotal) / referenceTotal) * 100;
}

export function resolveCollectionMonthlyComparisonBenchmarkDirection(
  difference: number | null,
): CollectionMonthlyBenchmarkDirection {
  if (difference === null) {
    return "unavailable";
  }
  if (difference > 0) {
    return "increase";
  }
  if (difference < 0) {
    return "decrease";
  }
  return "no_change";
}

export function normalizeCollectionSameDayAmount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function resolveCollectionSameDayPercentageChange(
  currentTotal: number,
  previousTotal: number,
): number | null {
  if (previousTotal === 0) {
    return currentTotal === 0 ? 0 : null;
  }
  return ((currentTotal - previousTotal) / previousTotal) * 100;
}
