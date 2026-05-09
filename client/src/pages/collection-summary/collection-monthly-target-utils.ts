import type { CollectionMonthlyComparisonResponse } from "@/lib/api";

export type CollectionMonthlyComparisonTargetLookup = Record<string, number | null | undefined>;

export type CollectionMonthlyComparisonTargetInput =
  | number
  | null
  | undefined
  | CollectionMonthlyComparisonTargetLookup;

export type CollectionMonthlyComparisonTargetSummary = {
  monthlyTargetAmount: number;
  rangeTarget: number;
  targetGap: number;
  targetProgress: number;
  monthsAtOrAboveTarget: number;
  monthsBelowTarget: number;
  configuredMonthCount: number;
  missingMonthCount: number;
  targetByMonth: CollectionMonthlyComparisonTargetLookup;
};

export function normalizeCollectionMonthlyComparisonTargetAmount(
  value: number | null | undefined,
): number | null {
  const target = Number(value || 0);
  return Number.isFinite(target) && target > 0 ? target : null;
}

export function resolveCollectionMonthlyComparisonTargetForMonth(
  monthKey: string,
  targetInput: CollectionMonthlyComparisonTargetInput,
): number | null {
  if (targetInput === null || targetInput === undefined) {
    return null;
  }

  if (typeof targetInput === "number") {
    return normalizeCollectionMonthlyComparisonTargetAmount(targetInput);
  }

  return normalizeCollectionMonthlyComparisonTargetAmount(targetInput[monthKey] ?? null);
}

function buildCollectionMonthlyComparisonTargetByMonth(
  payload: CollectionMonthlyComparisonResponse,
  targetInput: CollectionMonthlyComparisonTargetInput,
): CollectionMonthlyComparisonTargetLookup {
  return payload.months.reduce<CollectionMonthlyComparisonTargetLookup>((lookup, month) => {
    lookup[month.month] = resolveCollectionMonthlyComparisonTargetForMonth(month.month, targetInput);
    return lookup;
  }, {});
}

export function buildCollectionMonthlyComparisonTargetSummary(
  payload: CollectionMonthlyComparisonResponse,
  monthlyTargetAmount: CollectionMonthlyComparisonTargetInput,
): CollectionMonthlyComparisonTargetSummary | null {
  const targetByMonth = buildCollectionMonthlyComparisonTargetByMonth(payload, monthlyTargetAmount);
  const configuredMonths = payload.months
    .map((month) => ({
      ...month,
      target: targetByMonth[month.month] ?? null,
    }))
    .filter((month) => month.target !== null);

  if (configuredMonths.length === 0) {
    return null;
  }

  const targetMonthKey = payload.comparison.targetMonth || payload.endMonth || payload.months[payload.months.length - 1]?.month || "";
  const targetMonthAmount = resolveCollectionMonthlyComparisonTargetForMonth(targetMonthKey, targetByMonth)
    ?? configuredMonths[configuredMonths.length - 1]?.target
    ?? null;
  if (targetMonthAmount === null) {
    return null;
  }

  const configuredRangeTotal = configuredMonths.reduce((total, month) => (
    total + Number(month.totalCollection || 0)
  ), 0);
  const rangeTarget = configuredMonths.reduce((total, month) => total + Number(month.target || 0), 0);

  return {
    monthlyTargetAmount: targetMonthAmount,
    rangeTarget,
    targetGap: configuredRangeTotal - rangeTarget,
    targetProgress: rangeTarget > 0 ? configuredRangeTotal / rangeTarget : 0,
    monthsAtOrAboveTarget: configuredMonths.filter((month) => month.totalCollection >= Number(month.target || 0)).length,
    monthsBelowTarget: configuredMonths.filter((month) => month.totalCollection < Number(month.target || 0)).length,
    configuredMonthCount: configuredMonths.length,
    missingMonthCount: Math.max(0, payload.months.length - configuredMonths.length),
    targetByMonth,
  };
}
