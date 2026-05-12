import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import {
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonPercentage,
  shiftCollectionMonthInput,
} from "./collection-monthly-format-utils";
import {
  resolveCollectionMonthlyComparisonBenchmarkDirection,
  resolveCollectionMonthlyComparisonPercentageChange,
} from "./collection-monthly-stat-utils";

export type CollectionMonthlyComparisonBenchmarkId =
  | "previous-month"
  | "same-month-last-year"
  | "previous-3-average"
  | "range-average";

export type CollectionMonthlyComparisonBenchmarkSummary = {
  id: CollectionMonthlyComparisonBenchmarkId;
  label: string;
  shortLabel: string;
  available: boolean;
  targetLabel: string;
  referenceLabel: string;
  targetTotal: number;
  referenceTotal: number | null;
  difference: number | null;
  percentageChange: number | null;
  direction: "increase" | "decrease" | "no_change" | "unavailable";
  formula: string;
  summary: string;
};

function buildCollectionMonthlyComparisonBenchmarkSummary(
  input: {
    id: CollectionMonthlyComparisonBenchmarkId;
    label: string;
    shortLabel: string;
    targetLabel: string;
    targetTotal: number;
    referenceLabel: string;
    referenceTotal: number | null;
    formula: string;
    unavailableSummary: string;
  },
): CollectionMonthlyComparisonBenchmarkSummary {
  const difference = input.referenceTotal === null
    ? null
    : input.targetTotal - input.referenceTotal;
  const percentageChange = input.referenceTotal === null
    ? null
    : resolveCollectionMonthlyComparisonPercentageChange(input.targetTotal, input.referenceTotal);
  const direction = resolveCollectionMonthlyComparisonBenchmarkDirection(difference);
  const available = input.referenceTotal !== null;

  let summary = input.unavailableSummary;
  if (available) {
    const verb = direction === "increase"
      ? "is above"
      : direction === "decrease" ? "is below" : "matches";
    const percentageSegment = percentageChange === null
      ? "from a zero reference"
      : `(${formatCollectionMonthlyComparisonPercentage(percentageChange)})`;
    summary = `${input.targetLabel} ${verb} ${input.referenceLabel} by ${formatCollectionMonthlyComparisonDifference(difference)} ${percentageSegment}.`;
  }

  return {
    id: input.id,
    label: input.label,
    shortLabel: input.shortLabel,
    available,
    targetLabel: input.targetLabel,
    referenceLabel: input.referenceLabel,
    targetTotal: input.targetTotal,
    referenceTotal: input.referenceTotal,
    difference,
    percentageChange,
    direction,
    formula: input.formula,
    summary,
  };
}

export function buildCollectionMonthlyComparisonBenchmarks(
  payload: CollectionMonthlyComparisonResponse,
): CollectionMonthlyComparisonBenchmarkSummary[] {
  const targetMonth = payload.months.find((month) => month.month === payload.comparison.targetMonth)
    || payload.months[payload.months.length - 1]
    || null;
  if (!targetMonth) {
    return [];
  }

  const targetIndex = payload.months.findIndex((month) => month.month === targetMonth.month);
  const previousMonth = targetIndex > 0
    ? payload.months[targetIndex - 1] || null
    : null;
  const sameMonthLastYearKey = shiftCollectionMonthInput(targetMonth.month, -12);
  const sameMonthLastYear = payload.months.find((month) => month.month === sameMonthLastYearKey) || null;
  const previousThreeMonths = targetIndex > 0
    ? payload.months.slice(Math.max(0, targetIndex - 3), targetIndex)
    : [];
  const historicalMonths = targetIndex > 0
    ? payload.months.slice(0, targetIndex)
    : [];
  const previousThreeAverage = previousThreeMonths.length === 3
    ? previousThreeMonths.reduce((total, month) => total + month.totalCollection, 0) / 3
    : null;
  const rangeAverage = historicalMonths.length > 0
    ? historicalMonths.reduce((total, month) => total + month.totalCollection, 0) / historicalMonths.length
    : null;

  return [
    buildCollectionMonthlyComparisonBenchmarkSummary({
      id: "previous-month",
      label: "Previous month",
      shortLabel: "Previous",
      targetLabel: targetMonth.label,
      targetTotal: targetMonth.totalCollection,
      referenceLabel: previousMonth?.label || "previous month",
      referenceTotal: previousMonth?.totalCollection ?? null,
      formula: "Target month total - previous month total",
      unavailableSummary: "Previous month benchmark is unavailable because the selected range has no earlier month.",
    }),
    buildCollectionMonthlyComparisonBenchmarkSummary({
      id: "same-month-last-year",
      label: "Same month last year",
      shortLabel: "Last year",
      targetLabel: targetMonth.label,
      targetTotal: targetMonth.totalCollection,
      referenceLabel: sameMonthLastYear?.label || sameMonthLastYearKey,
      referenceTotal: sameMonthLastYear?.totalCollection ?? null,
      formula: "Target month total - same calendar month last year",
      unavailableSummary: `Same-month-last-year benchmark needs ${sameMonthLastYearKey} in the selected range.`,
    }),
    buildCollectionMonthlyComparisonBenchmarkSummary({
      id: "previous-3-average",
      label: "Previous 3-month average",
      shortLabel: "3-mo avg",
      targetLabel: targetMonth.label,
      targetTotal: targetMonth.totalCollection,
      referenceLabel: previousThreeMonths.length === 3
        ? `${previousThreeMonths[0]?.label} to ${previousThreeMonths[2]?.label} average`
        : "previous 3-month average",
      referenceTotal: previousThreeAverage,
      formula: "Target month total - average total of the previous 3 months",
      unavailableSummary: "Previous 3-month average needs at least three months before the target month.",
    }),
    buildCollectionMonthlyComparisonBenchmarkSummary({
      id: "range-average",
      label: "Selected range average",
      shortLabel: "Range avg",
      targetLabel: targetMonth.label,
      targetTotal: targetMonth.totalCollection,
      referenceLabel: historicalMonths.length > 0
        ? `${historicalMonths[0]?.label} to ${historicalMonths[historicalMonths.length - 1]?.label} average`
        : "selected range average",
      referenceTotal: rangeAverage,
      formula: "Target month total - average total of all earlier months in the selected range",
      unavailableSummary: "Selected range average needs at least one earlier month before the target month.",
    }),
  ];
}
