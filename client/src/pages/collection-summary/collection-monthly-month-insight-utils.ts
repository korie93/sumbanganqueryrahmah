import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import {
  resolveCollectionMonthlyComparisonAnomaly,
  type CollectionMonthlyComparisonAnomalyDirection,
} from "./collection-monthly-anomaly-utils";

type CollectionMonthlyComparisonMonth = CollectionMonthlyComparisonResponse["months"][number];

export type CollectionMonthlyComparisonMonthInsight = CollectionMonthlyComparisonMonth & {
  previousTotal: number | null;
  deltaFromPrevious: number | null;
  percentageFromPrevious: number | null;
  isAnomaly: boolean;
  anomalyDirection: CollectionMonthlyComparisonAnomalyDirection | null;
  anomalyMagnitudePercent: number | null;
  anomalyLabel: string | null;
  shareOfRangeTotal: number;
  maxTotalRatio: number;
  isBaseMonth: boolean;
  isTargetMonth: boolean;
  isPeakMonth: boolean;
  isLowestActiveMonth: boolean;
};

export type CollectionMonthlyComparisonInsights = {
  rangeTotal: number;
  totalRecords: number;
  activeMonthCount: number;
  emptyMonthCount: number;
  averagePerMonth: number;
  averagePerRecord: number;
  peakMonth: CollectionMonthlyComparisonMonth | null;
  lowestActiveMonth: CollectionMonthlyComparisonMonth | null;
  strongestIncreaseMonth: CollectionMonthlyComparisonMonthInsight | null;
  strongestDecreaseMonth: CollectionMonthlyComparisonMonthInsight | null;
  positiveMonthCount: number;
  negativeMonthCount: number;
  flatMonthCount: number;
  anomalyMonthCount: number;
  anomalyMonths: CollectionMonthlyComparisonMonthInsight[];
  monthInsights: CollectionMonthlyComparisonMonthInsight[];
};

export function buildCollectionMonthlyComparisonInsights(
  payload: CollectionMonthlyComparisonResponse,
): CollectionMonthlyComparisonInsights {
  const rangeTotal = payload.months.reduce(
    (total, month) => total + month.totalCollection,
    0,
  );
  const totalRecords = payload.months.reduce(
    (total, month) => total + month.recordCount,
    0,
  );
  const activeMonths = payload.months.filter((month) => month.recordCount > 0);
  const peakMonth = payload.months.reduce<CollectionMonthlyComparisonMonth | null>(
    (currentPeak, month) => {
      if (!currentPeak || month.totalCollection > currentPeak.totalCollection) {
        return month;
      }
      return currentPeak;
    },
    null,
  );
  const lowestActiveMonth = activeMonths.reduce<CollectionMonthlyComparisonMonth | null>(
    (currentLowest, month) => {
      if (!currentLowest || month.totalCollection < currentLowest.totalCollection) {
        return month;
      }
      return currentLowest;
    },
    null,
  );
  const maxTotal = Math.max(0, peakMonth?.totalCollection || 0);

  let positiveMonthCount = 0;
  let negativeMonthCount = 0;
  let flatMonthCount = 0;

  const monthInsights = payload.months.map((month, index) => {
    const previousMonth = index > 0 ? payload.months[index - 1] : null;
    const previousTotal = previousMonth?.totalCollection ?? null;
    const deltaFromPrevious = previousTotal === null
      ? null
      : month.totalCollection - previousTotal;
    let percentageFromPrevious: number | null = null;

    if (previousTotal !== null && deltaFromPrevious !== null) {
      percentageFromPrevious = previousTotal === 0
        ? deltaFromPrevious === 0 ? 0 : null
        : (deltaFromPrevious / previousTotal) * 100;
    }

    if (deltaFromPrevious !== null) {
      if (deltaFromPrevious > 0) {
        positiveMonthCount += 1;
      } else if (deltaFromPrevious < 0) {
        negativeMonthCount += 1;
      } else {
        flatMonthCount += 1;
      }
    }

    const anomaly = resolveCollectionMonthlyComparisonAnomaly(
      deltaFromPrevious,
      percentageFromPrevious,
    );

    return {
      ...month,
      previousTotal,
      deltaFromPrevious,
      percentageFromPrevious,
      ...anomaly,
      shareOfRangeTotal: rangeTotal > 0 ? month.totalCollection / rangeTotal : 0,
      maxTotalRatio: maxTotal > 0 ? month.totalCollection / maxTotal : 0,
      isBaseMonth: payload.comparison.baseMonth === month.month,
      isTargetMonth: payload.comparison.targetMonth === month.month,
      isPeakMonth: maxTotal > 0 && month.totalCollection === maxTotal,
      isLowestActiveMonth: lowestActiveMonth?.month === month.month,
    };
  });
  const strongestIncreaseMonth =
    monthInsights.reduce<CollectionMonthlyComparisonMonthInsight | null>(
      (strongest, month) => {
        if ((month.deltaFromPrevious ?? 0) <= 0) {
          return strongest;
        }
        if (!strongest || (month.deltaFromPrevious ?? 0) > (strongest.deltaFromPrevious ?? 0)) {
          return month;
        }
        return strongest;
      },
      null,
    );
  const strongestDecreaseMonth =
    monthInsights.reduce<CollectionMonthlyComparisonMonthInsight | null>(
      (strongest, month) => {
        if ((month.deltaFromPrevious ?? 0) >= 0) {
          return strongest;
        }
        if (!strongest || (month.deltaFromPrevious ?? 0) < (strongest.deltaFromPrevious ?? 0)) {
          return month;
        }
        return strongest;
      },
      null,
    );
  const anomalyMonths = monthInsights.filter((month) => month.isAnomaly);

  return {
    rangeTotal,
    totalRecords,
    activeMonthCount: activeMonths.length,
    emptyMonthCount: payload.months.length - activeMonths.length,
    averagePerMonth: payload.months.length > 0 ? rangeTotal / payload.months.length : 0,
    averagePerRecord: totalRecords > 0 ? rangeTotal / totalRecords : 0,
    peakMonth,
    lowestActiveMonth,
    strongestIncreaseMonth,
    strongestDecreaseMonth,
    positiveMonthCount,
    negativeMonthCount,
    flatMonthCount,
    anomalyMonthCount: anomalyMonths.length,
    anomalyMonths,
    monthInsights,
  };
}
