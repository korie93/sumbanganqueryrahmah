import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

export const COLLECTION_MONTHLY_COMPARISON_MAX_RANGE_MONTHS = 24;
export const COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT = 30;

const COLLECTION_MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;
const COMPACT_AMOUNT_FORMATTER = new Intl.NumberFormat("en-MY", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type CollectionMonthlyComparisonMonth = CollectionMonthlyComparisonResponse["months"][number];

export type CollectionMonthlyComparisonAnomalyDirection = "increase" | "decrease";

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

export type CollectionMonthlyComparisonTargetLookup = Record<string, number | null | undefined>;

export type CollectionMonthlyComparisonTargetInput =
  | number
  | null
  | undefined
  | CollectionMonthlyComparisonTargetLookup;

export type CollectionMonthlyComparisonProjection = {
  month: string;
  label: string;
  elapsedDays: number;
  totalDays: number;
  remainingDays: number;
  currentTotal: number;
  dailyAverage: number;
  projectedTotal: number;
  projectedDifference: number;
  monthlyTargetAmount: number | null;
  targetGap: number | null;
  targetProgress: number | null;
  requiredDailyAverageToTarget: number | null;
  status: "on_track" | "behind" | "no_target";
};

export type CollectionSameDayPaceDailyInput = {
  day: number;
  date?: string | undefined;
  amount: number;
  customerCount?: number | undefined;
};

export type CollectionSameDayPacePoint = {
  day: number;
  currentDate: string;
  previousDate: string;
  currentAmount: number;
  previousAmount: number;
  currentCumulative: number;
  previousCumulative: number;
  dailyDifference: number;
  cumulativeDifference: number;
};

export type CollectionSameDayPaceMomentum = {
  direction: "accelerating" | "slowing" | "steady" | "insufficient_data";
  splitDay: number;
  firstHalfAverage: number;
  secondHalfAverage: number;
  percentageChange: number | null;
  label: string;
  description: string;
};

export type CollectionSameDayPaceConsistency = {
  status: "consistent" | "mixed" | "inconsistent" | "no_data";
  coefficient: number | null;
  label: string;
  description: string;
};

export type CollectionSameDayPaceTarget = {
  monthlyTargetAmount: number;
  expectedByToday: number;
  expectedProgress: number;
  paceGap: number;
  projectedTotal: number;
  projectedTargetGap: number;
  requiredDailyAverageToTarget: number;
  status: "on_track" | "behind" | "needs_consistency";
  label: string;
};

export type CollectionSameDayPaceComparison = {
  currentMonth: string;
  previousMonth: string;
  currentLabel: string;
  previousLabel: string;
  comparisonDay: number;
  currentRangeLabel: string;
  previousRangeLabel: string;
  totalDaysInCurrentMonth: number;
  totalDaysInPreviousMonth: number;
  rangeCappedByPreviousMonth: boolean;
  currentTotal: number;
  previousTotal: number;
  difference: number;
  percentageChange: number | null;
  direction: "faster" | "slower" | "flat" | "no_previous_data";
  headline: string;
  summary: string;
  currentDailyAverage: number;
  previousDailyAverage: number;
  dailyAverageDifference: number;
  dailyAveragePercentageChange: number | null;
  momentum: CollectionSameDayPaceMomentum;
  consistency: CollectionSameDayPaceConsistency;
  target: CollectionSameDayPaceTarget | null;
  points: CollectionSameDayPacePoint[];
  insights: string[];
};

export type CollectionMonthlyComparisonDataQualitySignal = {
  id: string;
  label: string;
  description: string;
  tone: "success" | "warning" | "danger" | "info";
};

export type CollectionMonthlyComparisonDataQualitySummary = {
  statusLabel: string;
  statusTone: "success" | "warning" | "danger" | "info";
  warningCount: number;
  signals: CollectionMonthlyComparisonDataQualitySignal[];
};

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

export type CollectionMonthlyComparisonPresetRange = {
  id: "last-3" | "last-6" | "year-to-date" | "previous-year";
  label: string;
  startMonth: string;
  endMonth: string;
};

export function parseCollectionMonthKey(value: string) {
  const normalized = String(value || "").trim();
  if (!COLLECTION_MONTH_KEY_REGEX.test(normalized)) {
    return null;
  }

  const [yearRaw, monthRaw] = normalized.split("-");
  const year = Number.parseInt(yearRaw || "", 10);
  const month = Number.parseInt(monthRaw || "", 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

export function formatCollectionMonthInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftCollectionMonthInput(monthKey: string, offset: number): string {
  const parsed = parseCollectionMonthKey(monthKey);
  if (!parsed) {
    return monthKey;
  }

  const nextDate = new Date(parsed.year, parsed.month - 1 + offset, 1);
  return formatCollectionMonthInput(nextDate);
}

export function countCollectionMonthsInclusive(startMonth: string, endMonth: string): number {
  const start = parseCollectionMonthKey(startMonth);
  const end = parseCollectionMonthKey(endMonth);
  if (!start || !end) {
    return 0;
  }

  return ((end.year - start.year) * 12) + (end.month - start.month) + 1;
}

export function buildDefaultCollectionMonthlyComparisonRange(referenceDate = new Date()) {
  const endMonth = formatCollectionMonthInput(referenceDate);
  const startMonth = shiftCollectionMonthInput(endMonth, -1);
  return {
    startMonth,
    endMonth,
  };
}

export function buildCollectionMonthlyComparisonPresetRanges(
  referenceDate = new Date(),
): CollectionMonthlyComparisonPresetRange[] {
  const currentMonth = formatCollectionMonthInput(referenceDate);
  const currentYear = referenceDate.getFullYear();

  return [
    {
      id: "last-3",
      label: "Last 3 months",
      startMonth: shiftCollectionMonthInput(currentMonth, -2),
      endMonth: currentMonth,
    },
    {
      id: "last-6",
      label: "Last 6 months",
      startMonth: shiftCollectionMonthInput(currentMonth, -5),
      endMonth: currentMonth,
    },
    {
      id: "year-to-date",
      label: "Year to date",
      startMonth: `${currentYear}-01`,
      endMonth: currentMonth,
    },
    {
      id: "previous-year",
      label: "Previous year",
      startMonth: `${currentYear - 1}-01`,
      endMonth: `${currentYear - 1}-12`,
    },
  ];
}

export function formatCollectionMonthName(monthNumber: number): string {
  const safeMonth = Math.min(12, Math.max(1, Math.floor(monthNumber)));
  const date = new Date(2026, safeMonth - 1, 1);
  return new Intl.DateTimeFormat("en-MY", { month: "long" }).format(date);
}

export function formatCollectionMonthlyComparisonPercentage(value: number | null): string {
  if (value === null) {
    return "No previous month total";
  }
  if (value === 0) {
    return "0.00%";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatCollectionMonthlyComparisonDifference(value: number | null): string {
  if (value === null) {
    return "N/A";
  }
  const absoluteValue = Math.abs(value);
  const formatted = formatAmountRM(absoluteValue);
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
}

function resolveCollectionMonthlyComparisonPercentageChange(
  targetTotal: number,
  referenceTotal: number,
): number | null {
  if (referenceTotal === 0) {
    return targetTotal === 0 ? 0 : null;
  }
  return ((targetTotal - referenceTotal) / referenceTotal) * 100;
}

function resolveCollectionMonthlyComparisonBenchmarkDirection(
  difference: number | null,
): CollectionMonthlyComparisonBenchmarkSummary["direction"] {
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

export function getCollectionDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function normalizeCollectionSameDayAmount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function resolveCollectionSameDayPercentageChange(
  currentTotal: number,
  previousTotal: number,
): number | null {
  if (previousTotal === 0) {
    return currentTotal === 0 ? 0 : null;
  }
  return ((currentTotal - previousTotal) / previousTotal) * 100;
}

function formatCollectionSameDayPaceMonthLabel(monthKey: string): string {
  const parsed = parseCollectionMonthKey(monthKey);
  if (!parsed) {
    return monthKey;
  }
  return `${formatCollectionMonthName(parsed.month)} ${parsed.year}`;
}

function formatCollectionSameDayPaceDate(monthKey: string, day: number): string {
  const parsed = parseCollectionMonthKey(monthKey);
  if (!parsed) {
    return "";
  }
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatCollectionSameDayPaceDisplayDate(dateValue: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || "").trim());
  if (!match) {
    return dateValue;
  }

  const year = Number.parseInt(match[1] || "", 10);
  const month = Number.parseInt(match[2] || "", 10);
  const day = Number.parseInt(match[3] || "", 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return dateValue;
  }

  return `${day} ${formatCollectionMonthName(month)} ${year}`;
}

function formatCollectionSameDayPaceRangeLabel(monthKey: string, throughDay: number): string {
  const parsed = parseCollectionMonthKey(monthKey);
  if (!parsed) {
    return monthKey;
  }
  const monthName = formatCollectionMonthName(parsed.month);
  return `${monthName} 1 to ${monthName} ${throughDay}, ${parsed.year}`;
}

function formatCollectionSameDayPacePercent(value: number | null): string {
  if (value === null) {
    return "no baseline";
  }
  return `${Math.abs(value).toFixed(1)}%`;
}

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

  if (pace?.target) {
    const targetProgress = point.currentCumulative / pace.target.monthlyTargetAmount;
    insights.push(`Target progress by ${currentDate}: ${(targetProgress * 100).toFixed(1)}%.`);
  }

  return insights;
}

function buildCollectionSameDayPaceMomentum(points: CollectionSameDayPacePoint[]): CollectionSameDayPaceMomentum {
  const comparisonDay = points.length;
  if (comparisonDay < 4) {
    return {
      direction: "insufficient_data",
      splitDay: Math.max(1, Math.floor(comparisonDay / 2)),
      firstHalfAverage: 0,
      secondHalfAverage: 0,
      percentageChange: null,
      label: "Momentum pending",
      description: "At least four days are needed before momentum is meaningful.",
    };
  }

  const splitDay = Math.max(2, Math.floor(comparisonDay / 2));
  const firstHalf = points.slice(0, splitDay);
  const secondHalf = points.slice(splitDay);
  const firstHalfAverage = firstHalf.reduce((total, point) => total + point.currentAmount, 0) / firstHalf.length;
  const secondHalfAverage = secondHalf.length > 0
    ? secondHalf.reduce((total, point) => total + point.currentAmount, 0) / secondHalf.length
    : firstHalfAverage;
  const percentageChange = resolveCollectionSameDayPercentageChange(secondHalfAverage, firstHalfAverage);

  if (firstHalfAverage === 0 && secondHalfAverage === 0) {
    return {
      direction: "steady",
      splitDay,
      firstHalfAverage,
      secondHalfAverage,
      percentageChange: 0,
      label: "No momentum yet",
      description: "No collection has been recorded across the compared days.",
    };
  }

  if (percentageChange !== null && percentageChange <= -15) {
    return {
      direction: "slowing",
      splitDay,
      firstHalfAverage,
      secondHalfAverage,
      percentageChange,
      label: "Momentum weakening",
      description: `Current month pace weakened after day ${splitDay}.`,
    };
  }

  if (percentageChange === null || percentageChange >= 15) {
    return {
      direction: "accelerating",
      splitDay,
      firstHalfAverage,
      secondHalfAverage,
      percentageChange,
      label: "Momentum improving",
      description: `Current month pace strengthened after day ${splitDay}.`,
    };
  }

  return {
    direction: "steady",
    splitDay,
    firstHalfAverage,
    secondHalfAverage,
    percentageChange,
    label: "Momentum steady",
    description: "Current month pace is broadly stable across the compared days.",
  };
}

function buildCollectionSameDayPaceConsistency(points: CollectionSameDayPacePoint[]): CollectionSameDayPaceConsistency {
  const values = points.map((point) => point.currentAmount);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (values.length === 0 || total <= 0) {
    return {
      status: "no_data",
      coefficient: null,
      label: "Consistency pending",
      description: "No current-month collection is available to measure consistency.",
    };
  }

  const mean = total / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const coefficient = mean > 0 ? Math.sqrt(variance) / mean : 0;

  if (coefficient >= 0.75) {
    return {
      status: "inconsistent",
      coefficient,
      label: "Inconsistent pace",
      description: "Daily collection varies heavily across the compared days.",
    };
  }

  if (coefficient >= 0.4) {
    return {
      status: "mixed",
      coefficient,
      label: "Mixed pace",
      description: "Daily collection is moving, but the pattern is uneven.",
    };
  }

  return {
    status: "consistent",
    coefficient,
    label: "Consistent pace",
    description: "Daily collection is relatively stable across the compared days.",
  };
}

function buildCollectionSameDayPaceTarget(input: {
  monthlyTargetAmount?: number | null | undefined;
  currentTotal: number;
  currentDailyAverage: number;
  comparisonDay: number;
  totalDaysInCurrentMonth: number;
}): CollectionSameDayPaceTarget | null {
  const monthlyTargetAmount = Number(input.monthlyTargetAmount || 0);
  if (!Number.isFinite(monthlyTargetAmount) || monthlyTargetAmount <= 0) {
    return null;
  }

  const expectedByToday = (monthlyTargetAmount * input.comparisonDay) / input.totalDaysInCurrentMonth;
  const expectedProgress = monthlyTargetAmount > 0 ? input.currentTotal / monthlyTargetAmount : 0;
  const paceGap = input.currentTotal - expectedByToday;
  const projectedTotal = input.currentDailyAverage * input.totalDaysInCurrentMonth;
  const projectedTargetGap = projectedTotal - monthlyTargetAmount;
  const remainingDays = Math.max(0, input.totalDaysInCurrentMonth - input.comparisonDay);
  const requiredDailyAverageToTarget = remainingDays > 0
    ? Math.max(0, monthlyTargetAmount - input.currentTotal) / remainingDays
    : Math.max(0, monthlyTargetAmount - input.currentTotal);
  const status = paceGap >= 0
    ? "on_track"
    : projectedTotal >= monthlyTargetAmount ? "needs_consistency" : "behind";
  const label = status === "on_track"
    ? "Ahead of target pace"
    : status === "needs_consistency" ? "Needs steady pace" : "Behind target pace";

  return {
    monthlyTargetAmount,
    expectedByToday,
    expectedProgress,
    paceGap,
    projectedTotal,
    projectedTargetGap,
    requiredDailyAverageToTarget,
    status,
    label,
  };
}

export function buildCollectionSameDayPaceComparison(input: {
  currentMonthKey: string;
  previousMonthKey?: string | undefined;
  currentDaily: CollectionSameDayPaceDailyInput[];
  previousDaily: CollectionSameDayPaceDailyInput[];
  monthlyTargetAmount?: number | null | undefined;
  referenceDate?: Date | undefined;
}): CollectionSameDayPaceComparison | null {
  const referenceDate = input.referenceDate || new Date();
  if (!Number.isFinite(referenceDate.getTime())) {
    return null;
  }

  const currentMonth = parseCollectionMonthKey(input.currentMonthKey);
  if (!currentMonth) {
    return null;
  }

  const previousMonthKey = input.previousMonthKey || shiftCollectionMonthInput(input.currentMonthKey, -1);
  const previousMonth = parseCollectionMonthKey(previousMonthKey);
  if (!previousMonth) {
    return null;
  }

  const totalDaysInCurrentMonth = getCollectionDaysInMonth(currentMonth.year, currentMonth.month);
  const totalDaysInPreviousMonth = getCollectionDaysInMonth(previousMonth.year, previousMonth.month);
  const referenceMonthKey = formatCollectionMonthInput(referenceDate);
  const rawComparisonDay = referenceMonthKey === input.currentMonthKey
    ? referenceDate.getDate()
    : totalDaysInCurrentMonth;
  const comparisonDay = Math.min(
    totalDaysInCurrentMonth,
    totalDaysInPreviousMonth,
    Math.max(1, rawComparisonDay),
  );
  const rangeCappedByPreviousMonth = comparisonDay < Math.min(totalDaysInCurrentMonth, Math.max(1, rawComparisonDay));
  const currentByDay = new Map<number, number>();
  const previousByDay = new Map<number, number>();

  for (const day of input.currentDaily) {
    const dayNumber = Math.max(1, Math.trunc(Number(day.day || 0)));
    if (dayNumber <= totalDaysInCurrentMonth) {
      currentByDay.set(dayNumber, normalizeCollectionSameDayAmount(day.amount));
    }
  }
  for (const day of input.previousDaily) {
    const dayNumber = Math.max(1, Math.trunc(Number(day.day || 0)));
    if (dayNumber <= totalDaysInPreviousMonth) {
      previousByDay.set(dayNumber, normalizeCollectionSameDayAmount(day.amount));
    }
  }

  let currentCumulative = 0;
  let previousCumulative = 0;
  const points: CollectionSameDayPacePoint[] = [];
  for (let day = 1; day <= comparisonDay; day += 1) {
    const currentAmount = currentByDay.get(day) || 0;
    const previousAmount = previousByDay.get(day) || 0;
    currentCumulative += currentAmount;
    previousCumulative += previousAmount;
    points.push({
      day,
      currentDate: formatCollectionSameDayPaceDate(input.currentMonthKey, day),
      previousDate: formatCollectionSameDayPaceDate(previousMonthKey, day),
      currentAmount,
      previousAmount,
      currentCumulative,
      previousCumulative,
      dailyDifference: currentAmount - previousAmount,
      cumulativeDifference: currentCumulative - previousCumulative,
    });
  }

  const currentTotal = currentCumulative;
  const previousTotal = previousCumulative;
  const difference = currentTotal - previousTotal;
  const percentageChange = resolveCollectionSameDayPercentageChange(currentTotal, previousTotal);
  const currentDailyAverage = currentTotal / comparisonDay;
  const previousDailyAverage = previousTotal / comparisonDay;
  const dailyAverageDifference = currentDailyAverage - previousDailyAverage;
  const dailyAveragePercentageChange = resolveCollectionSameDayPercentageChange(
    currentDailyAverage,
    previousDailyAverage,
  );
  const direction: CollectionSameDayPaceComparison["direction"] = previousTotal === 0 && currentTotal > 0
    ? "no_previous_data"
    : difference > 0 ? "faster" : difference < 0 ? "slower" : "flat";
  const currentLabel = formatCollectionSameDayPaceMonthLabel(input.currentMonthKey);
  const previousLabel = formatCollectionSameDayPaceMonthLabel(previousMonthKey);
  const currentRangeLabel = formatCollectionSameDayPaceRangeLabel(input.currentMonthKey, comparisonDay);
  const previousRangeLabel = formatCollectionSameDayPaceRangeLabel(previousMonthKey, comparisonDay);
  const momentum = buildCollectionSameDayPaceMomentum(points);
  const consistency = buildCollectionSameDayPaceConsistency(points);
  const target = buildCollectionSameDayPaceTarget({
    monthlyTargetAmount: input.monthlyTargetAmount,
    currentTotal,
    currentDailyAverage,
    comparisonDay,
    totalDaysInCurrentMonth,
  });

  const headline = direction === "faster"
    ? `${formatCollectionSameDayPacePercent(percentageChange)} faster than previous month`
    : direction === "slower"
      ? `${formatCollectionSameDayPacePercent(percentageChange)} slower than previous month`
      : direction === "flat"
        ? "Matching previous month pace"
        : "No previous same-day baseline";
  const summary = direction === "faster"
    ? `${currentLabel} is ahead of ${previousLabel} by ${formatCollectionMonthlyComparisonDifference(difference)} for the same day range.`
    : direction === "slower"
      ? `${currentLabel} is behind ${previousLabel} by ${formatCollectionMonthlyComparisonDifference(difference)} for the same day range.`
      : direction === "flat"
        ? `${currentLabel} matches ${previousLabel} for the same day range.`
        : `${currentLabel} has collection, but ${previousLabel} has no same-day baseline yet.`;
  const insights = [
    direction === "slower"
      ? `You collected ${formatAmountRM(Math.abs(difference))} less than previous month for the same date range.`
      : direction === "faster"
        ? `You collected ${formatAmountRM(Math.abs(difference))} more than previous month for the same date range.`
        : direction === "flat"
          ? "Same-day collection is level with previous month."
          : "Previous month has no same-day collection baseline for this range.",
    dailyAverageDifference < 0
      ? `Daily collection average decreased by ${formatCollectionSameDayPacePercent(dailyAveragePercentageChange)}.`
      : dailyAverageDifference > 0
        ? `Daily collection average increased by ${formatCollectionSameDayPacePercent(dailyAveragePercentageChange)}.`
        : "Daily collection average is unchanged.",
    momentum.description,
    consistency.description,
  ];

  if (target) {
    insights.push(
      target.status === "on_track"
        ? `Current pace is ahead of target by ${formatAmountRM(Math.abs(target.paceGap))}.`
        : `Current pace is behind target by ${formatAmountRM(Math.abs(target.paceGap))}.`,
    );
  }
  if (rangeCappedByPreviousMonth) {
    insights.push(`Comparison is capped at day ${comparisonDay} because ${previousLabel} has fewer calendar days.`);
  }

  return {
    currentMonth: input.currentMonthKey,
    previousMonth: previousMonthKey,
    currentLabel,
    previousLabel,
    comparisonDay,
    currentRangeLabel,
    previousRangeLabel,
    totalDaysInCurrentMonth,
    totalDaysInPreviousMonth,
    rangeCappedByPreviousMonth,
    currentTotal,
    previousTotal,
    difference,
    percentageChange,
    direction,
    headline,
    summary,
    currentDailyAverage,
    previousDailyAverage,
    dailyAverageDifference,
    dailyAveragePercentageChange,
    momentum,
    consistency,
    target,
    points,
    insights,
  };
}

export function buildCollectionMonthlyComparisonProjection(
  payload: CollectionMonthlyComparisonResponse,
  monthlyTargetAmount?: CollectionMonthlyComparisonTargetInput,
  referenceDate = new Date(),
): CollectionMonthlyComparisonProjection | null {
  if (!Number.isFinite(referenceDate.getTime())) {
    return null;
  }

  const currentMonthKey = formatCollectionMonthInput(referenceDate);
  const currentMonth = payload.months.find((month) => month.month === currentMonthKey) || null;
  const parsed = parseCollectionMonthKey(currentMonthKey);
  if (!currentMonth || !parsed) {
    return null;
  }

  const totalDays = getCollectionDaysInMonth(parsed.year, parsed.month);
  const elapsedDays = Math.min(totalDays, Math.max(1, referenceDate.getDate()));
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const currentTotal = Math.max(0, Number(currentMonth.totalCollection || 0));
  const dailyAverage = currentTotal / elapsedDays;
  const projectedTotal = dailyAverage * totalDays;
  const projectedDifference = projectedTotal - currentTotal;
  const monthlyTarget = resolveCollectionMonthlyComparisonTargetForMonth(currentMonth.month, monthlyTargetAmount);
  const targetGap = monthlyTarget === null ? null : projectedTotal - monthlyTarget;
  const targetProgress = monthlyTarget === null ? null : projectedTotal / monthlyTarget;
  const requiredDailyAverageToTarget = monthlyTarget === null
    ? null
    : remainingDays > 0
      ? Math.max(0, monthlyTarget - currentTotal) / remainingDays
      : Math.max(0, monthlyTarget - currentTotal);
  const status = monthlyTarget === null
    ? "no_target"
    : projectedTotal >= monthlyTarget ? "on_track" : "behind";

  return {
    month: currentMonth.month,
    label: currentMonth.label,
    elapsedDays,
    totalDays,
    remainingDays,
    currentTotal,
    dailyAverage,
    projectedTotal,
    projectedDifference,
    monthlyTargetAmount: monthlyTarget,
    targetGap,
    targetProgress,
    requiredDailyAverageToTarget,
    status,
  };
}

export function buildCollectionMonthlyComparisonDataQualitySummary(
  payload: CollectionMonthlyComparisonResponse,
  monthlyTargetAmount?: CollectionMonthlyComparisonTargetInput,
  referenceDate = new Date(),
): CollectionMonthlyComparisonDataQualitySummary {
  const insights = buildCollectionMonthlyComparisonInsights(payload);
  const targetSummary = buildCollectionMonthlyComparisonTargetSummary(payload, monthlyTargetAmount);
  const projection = buildCollectionMonthlyComparisonProjection(payload, monthlyTargetAmount, referenceDate);
  const signals: CollectionMonthlyComparisonDataQualitySignal[] = [];

  if (targetSummary) {
    signals.push({
      id: "target-configured",
      label: "Target configured",
      description: targetSummary.missingMonthCount > 0
        ? `${targetSummary.configuredMonthCount}/${payload.months.length} selected month(s) have superuser targets. Missing months are excluded from target progress.`
        : `${formatAmountRM(targetSummary.monthlyTargetAmount)} target is active for the target month, with all selected months configured.`,
      tone: "success",
    });
  } else {
    signals.push({
      id: "target-missing",
      label: "Target missing",
      description: "No superuser monthly target is available, so target status is hidden from calculations.",
      tone: "warning",
    });
  }

  if (insights.anomalyMonthCount > 0) {
    const firstAnomaly = insights.anomalyMonths[0];
    signals.push({
      id: "anomaly-months",
      label: `${insights.anomalyMonthCount} anomaly month(s)`,
      description: firstAnomaly?.anomalyLabel || "One or more months moved more than the audit threshold.",
      tone: "warning",
    });
  } else {
    signals.push({
      id: "no-anomaly",
      label: "Anomaly clear",
      description: `No month moved more than ${COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT}% against the previous month.`,
      tone: "success",
    });
  }

  if (insights.emptyMonthCount > 0) {
    const emptyLabels = insights.monthInsights
      .filter((month) => month.recordCount === 0)
      .slice(0, 2)
      .map((month) => month.label)
      .join(", ");
    signals.push({
      id: "empty-months",
      label: `${insights.emptyMonthCount} empty month(s)`,
      description: emptyLabels
        ? `Review empty month(s): ${emptyLabels}${insights.emptyMonthCount > 2 ? ", ..." : ""}.`
        : "Review empty months before sharing the report.",
      tone: "warning",
    });
  }

  if (insights.activeMonthCount >= 3) {
    const activeRecordAverage = insights.totalRecords / insights.activeMonthCount;
    const lowRecordMonths = insights.monthInsights.filter(
      (month) => month.recordCount > 0 && month.recordCount < activeRecordAverage * 0.5,
    );
    if (lowRecordMonths.length > 0) {
      signals.push({
        id: "low-record-volume",
        label: `${lowRecordMonths.length} low-volume month(s)`,
        description: `${lowRecordMonths[0]?.label || "A month"} has less than half the active-month average record count.`,
        tone: "info",
      });
    }
  }

  if (projection) {
    if (projection.status === "behind") {
      signals.push({
        id: "projection-behind",
        label: "Projection behind target",
        description: `${projection.label} is projected at ${formatAmountRM(projection.projectedTotal)}, below the configured target.`,
        tone: "warning",
      });
    } else if (projection.status === "on_track") {
      signals.push({
        id: "projection-on-track",
        label: "Projection on track",
        description: `${projection.label} is projected at ${formatAmountRM(projection.projectedTotal)}, meeting the configured target.`,
        tone: "success",
      });
    }
  }

  const warningCount = signals.filter((signal) => signal.tone === "warning" || signal.tone === "danger").length;
  const statusTone = warningCount >= 3 ? "danger" : warningCount > 0 ? "warning" : "success";
  const statusLabel = warningCount === 0
    ? "Quality checks clear"
    : warningCount === 1 ? "1 item needs review" : `${warningCount} items need review`;

  return {
    statusLabel,
    statusTone,
    warningCount,
    signals,
  };
}

export function formatCompactAmountRM(value: number): string {
  return `RM ${COMPACT_AMOUNT_FORMATTER.format(Math.max(0, value))}`;
}

export function formatCollectionMonthlyComparisonMonthDelta(
  difference: number | null,
  percentage: number | null,
): string {
  if (difference === null) {
    return "First month in range";
  }

  const formattedDifference = formatCollectionMonthlyComparisonDifference(difference);
  if (percentage === null) {
    return `${formattedDifference} from RM0 base`;
  }

  return `${formattedDifference} (${formatCollectionMonthlyComparisonPercentage(percentage)})`;
}

function resolveCollectionMonthlyComparisonAnomaly(
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

export function resolveCollectionMonthlyComparisonTone(
  direction: CollectionMonthlyComparisonResponse["comparison"]["direction"],
): "default" | "success" | "warning" {
  if (direction === "increase") {
    return "success";
  }
  if (direction === "decrease") {
    return "warning";
  }
  return "default";
}

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

function escapeCollectionMonthlyComparisonCsvValue(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export type CollectionMonthlyComparisonCsvOptions = {
  monthlyTargetAmount?: number | null | undefined;
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
  sameDayPace?: CollectionSameDayPaceComparison | null | undefined;
};

function resolveCollectionMonthlyComparisonCsvTargetInput(
  options: number | null | undefined | CollectionMonthlyComparisonCsvOptions,
): CollectionMonthlyComparisonTargetInput {
  if (
    options
    && typeof options === "object"
    && ("monthlyTargetAmount" in options || "monthlyTargetsByMonth" in options || "sameDayPace" in options)
  ) {
    return options.monthlyTargetsByMonth ?? options.monthlyTargetAmount ?? null;
  }

  return options as number | null | undefined;
}

function resolveCollectionMonthlyComparisonCsvSameDayPace(
  options: number | null | undefined | CollectionMonthlyComparisonCsvOptions,
): CollectionSameDayPaceComparison | null {
  if (
    options
    && typeof options === "object"
    && ("monthlyTargetAmount" in options || "monthlyTargetsByMonth" in options || "sameDayPace" in options)
  ) {
    return options.sameDayPace ?? null;
  }

  return null;
}

export function buildCollectionMonthlyComparisonCsv(
  payload: CollectionMonthlyComparisonResponse,
  options?: number | null | CollectionMonthlyComparisonCsvOptions,
): string {
  const insights = buildCollectionMonthlyComparisonInsights(payload);
  const targetInput = resolveCollectionMonthlyComparisonCsvTargetInput(options);
  const sameDayPace = resolveCollectionMonthlyComparisonCsvSameDayPace(options);
  const headers = [
    "Nickname",
    "Month",
    "Month Label",
    "Total Collection",
    "Record Count",
    "Average Per Record",
    "Share Of Range",
    "Difference From Previous",
    "Percentage From Previous",
    "Anomaly Status",
    "Anomaly Direction",
    "Anomaly Threshold Percent",
    "Monthly Target",
    "Target Difference",
    "Target Progress %",
    "Target Status",
  ];
  const rows = insights.monthInsights.map((month) => {
    const target = resolveCollectionMonthlyComparisonTargetForMonth(month.month, targetInput);
    const targetDifference = target === null ? null : month.totalCollection - target;
    const targetProgress = target === null ? null : (month.totalCollection / target) * 100;
    const targetStatus = target === null
      ? "No target configured"
      : month.totalCollection >= target ? "At or above target" : "Below target";

    return [
      payload.nickname,
      month.month,
      month.label,
      month.totalCollection.toFixed(2),
      month.recordCount,
      month.averagePerRecord.toFixed(2),
      (month.shareOfRangeTotal * 100).toFixed(2),
      month.deltaFromPrevious === null ? "" : month.deltaFromPrevious.toFixed(2),
      month.percentageFromPrevious === null ? "" : month.percentageFromPrevious.toFixed(2),
      month.anomalyLabel || "",
      month.anomalyDirection || "",
      COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT.toFixed(2),
      target === null ? "" : target.toFixed(2),
      targetDifference === null ? "" : targetDifference.toFixed(2),
      targetProgress === null ? "" : targetProgress.toFixed(2),
      targetStatus,
    ];
  });

  const monthlySection = [
    headers.map(escapeCollectionMonthlyComparisonCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCollectionMonthlyComparisonCsvValue).join(",")),
  ];

  if (!sameDayPace) {
    return monthlySection.join("\n");
  }

  const sameDayHeaders = [
    "Date",
    "Daily Collection",
    "Cumulative Collection",
    "Previous Month Date",
    "Previous Month Daily Collection",
    "Previous Month Cumulative Collection",
    "Daily Difference",
    "Cumulative Difference",
    "Monthly Target",
    "Target Progress %",
    "Pace Status",
  ];
  const sameDayRows = sameDayPace.points.map((point) => {
    const target = sameDayPace.target?.monthlyTargetAmount ?? null;
    const targetProgress = target === null ? null : (point.currentCumulative / target) * 100;
    return [
      point.currentDate,
      point.currentAmount.toFixed(2),
      point.currentCumulative.toFixed(2),
      point.previousDate,
      point.previousAmount.toFixed(2),
      point.previousCumulative.toFixed(2),
      point.dailyDifference.toFixed(2),
      point.cumulativeDifference.toFixed(2),
      target === null ? "" : target.toFixed(2),
      targetProgress === null ? "" : targetProgress.toFixed(2),
      buildCollectionSameDayPacePointTrendLabel(point),
    ];
  });

  return [
    ...monthlySection,
    "",
    escapeCollectionMonthlyComparisonCsvValue("Same-Day Pace Detail"),
    sameDayHeaders.map(escapeCollectionMonthlyComparisonCsvValue).join(","),
    ...sameDayRows.map((row) => row.map(escapeCollectionMonthlyComparisonCsvValue).join(",")),
  ].join("\n");
}

export function buildCollectionMonthlyComparisonCsvFilename(
  payload: CollectionMonthlyComparisonResponse,
): string {
  const safeNickname = String(payload.nickname || "staff")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "staff";
  return `SQR-monthly-comparison-${safeNickname}-${payload.startMonth}-to-${payload.endMonth}.csv`;
}

function escapeCollectionMonthlyComparisonHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCollectionMonthlyComparisonReportDate(date: Date): string {
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function buildCollectionMonthlyComparisonReportChartSvg(
  insights: CollectionMonthlyComparisonInsights,
  monthlyTargetInput: CollectionMonthlyComparisonTargetInput,
): string {
  const width = 760;
  const height = 260;
  const padding = { top: 22, right: 22, bottom: 44, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxCollection = Math.max(0, ...insights.monthInsights.map((month) => month.totalCollection));
  const maxTarget = Math.max(
    0,
    ...insights.monthInsights.map((month) => (
      resolveCollectionMonthlyComparisonTargetForMonth(month.month, monthlyTargetInput) || 0
    )),
  );
  const maxValue = Math.max(maxCollection, maxTarget, 1);
  const scaleMax = maxValue * 1.12;
  const slotWidth = plotWidth / Math.max(1, insights.monthInsights.length);
  const barWidth = Math.max(16, Math.min(44, slotWidth * 0.58));

  const bars = insights.monthInsights.map((month, index) => {
    const barHeight = Math.max(2, (month.totalCollection / scaleMax) * plotHeight);
    const x = padding.left + (slotWidth * index) + ((slotWidth - barWidth) / 2);
    const y = padding.top + plotHeight - barHeight;
    const fill = month.isAnomaly
      ? month.anomalyDirection === "decrease" ? "#dc2626" : "#d97706"
      : month.isTargetMonth ? "#047857" : "#2563eb";
    const label = escapeCollectionMonthlyComparisonHtml(month.label.replace(/\s+\d{4}$/, ""));
    return [
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="6" fill="${fill}" />`,
      `<text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 18}" text-anchor="middle" font-size="11" fill="#475569">${label}</text>`,
    ].join("");
  }).join("");

  const targetMarks = insights.monthInsights.map((month, index) => {
    const target = resolveCollectionMonthlyComparisonTargetForMonth(month.month, monthlyTargetInput);
    if (target === null) {
      return "";
    }
    const x = padding.left + (slotWidth * index) + Math.max(4, (slotWidth - barWidth) / 2);
    const y = padding.top + plotHeight - ((target / scaleMax) * plotHeight);
    const markWidth = Math.max(22, Math.min(slotWidth - 8, barWidth + 10));
    return [
      `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + markWidth).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#7c3aed" stroke-width="2" stroke-dasharray="5 4" />`,
      index === 0
        ? `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="11" fill="#5b21b6">Monthly target</text>`
        : "",
    ].join("");
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly comparison bar chart" class="report-chart">
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#f8fafc" />
      <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#cbd5e1" />
      <text x="${padding.left}" y="18" font-size="11" fill="#64748b">Total collection by month</text>
      ${targetMarks}
      ${bars}
    </svg>
  `;
}

export function buildCollectionMonthlyComparisonPrintReportHtml(
  payload: CollectionMonthlyComparisonResponse,
  options: {
    monthlyTargetAmount?: number | null | undefined;
    monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
    monthlyTargetSourceLabel?: string | null | undefined;
    sameDayPace?: CollectionSameDayPaceComparison | null | undefined;
    generatedAt?: Date | undefined;
  } = {},
): string {
  const insights = buildCollectionMonthlyComparisonInsights(payload);
  const benchmarks = buildCollectionMonthlyComparisonBenchmarks(payload);
  const trendExplanation = buildCollectionMonthlyComparisonTrendExplanation(payload);
  const targetInput = options.monthlyTargetsByMonth ?? options.monthlyTargetAmount ?? null;
  const targetSummary = buildCollectionMonthlyComparisonTargetSummary(
    payload,
    targetInput,
  );
  const reportReferenceDate = options.generatedAt || new Date();
  const projection = buildCollectionMonthlyComparisonProjection(
    payload,
    targetInput,
    reportReferenceDate,
  );
  const dataQuality = buildCollectionMonthlyComparisonDataQualitySummary(
    payload,
    targetInput,
    reportReferenceDate,
  );
  const targetStatus = !targetSummary
    ? "No configured monthly target"
    : targetSummary.targetGap >= 0
      ? "At or above range target"
      : "Below range target";
  const anomalySummary = insights.anomalyMonthCount > 0
    ? `${insights.anomalyMonthCount} anomaly month(s) flagged`
    : "No anomaly above threshold";
  const generatedAt = formatCollectionMonthlyComparisonReportDate(reportReferenceDate);
  const chartSvg = buildCollectionMonthlyComparisonReportChartSvg(insights, targetInput);
  const monthRows = insights.monthInsights.map((month) => {
    const monthTarget = resolveCollectionMonthlyComparisonTargetForMonth(month.month, targetInput);
    const targetGap = monthTarget === null
      ? "N/A"
      : formatCollectionMonthlyComparisonDifference(month.totalCollection - monthTarget);
    return `
      <tr>
        <td>${escapeCollectionMonthlyComparisonHtml(month.label)}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(formatAmountRM(month.totalCollection))}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(month.recordCount)}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(formatAmountRM(month.averagePerRecord))}</td>
        <td>${escapeCollectionMonthlyComparisonHtml(formatCollectionMonthlyComparisonMonthDelta(month.deltaFromPrevious, month.percentageFromPrevious))}</td>
        <td>${escapeCollectionMonthlyComparisonHtml(month.anomalyLabel || "Clear")}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(targetGap)}</td>
      </tr>
    `;
  }).join("");
  const anomalyRows = insights.anomalyMonths.length > 0
    ? insights.anomalyMonths.map((month) => `
      <li><strong>${escapeCollectionMonthlyComparisonHtml(month.label)}</strong>: ${escapeCollectionMonthlyComparisonHtml(month.anomalyLabel || "Anomaly flagged")}</li>
    `).join("")
    : "<li>No month moved more than the configured anomaly threshold.</li>";
  const projectionSummary = projection
    ? `${projection.label} current total ${formatAmountRM(projection.currentTotal)} after ${projection.elapsedDays}/${projection.totalDays} day(s), projected ${formatAmountRM(projection.projectedTotal)}${projection.targetGap === null ? "." : ` with target gap ${formatCollectionMonthlyComparisonDifference(projection.targetGap)}.`}`
    : "Current month is outside the selected range, so no projection is shown.";
  const qualityRows = dataQuality.signals.map((signal) => `
      <li><strong>${escapeCollectionMonthlyComparisonHtml(signal.label)}</strong>: ${escapeCollectionMonthlyComparisonHtml(signal.description)}</li>
    `).join("");
  const sameDayPace = options.sameDayPace || null;
  const sameDayPaceRows = sameDayPace
    ? sameDayPace.insights.slice(0, 5).map((insight) => `
      <li>${escapeCollectionMonthlyComparisonHtml(insight)}</li>
    `).join("")
    : "<li>Same-day pace data was not available for this report.</li>";
  const benchmarkRows = benchmarks.map((benchmark) => `
      <tr>
        <td>${escapeCollectionMonthlyComparisonHtml(benchmark.label)}</td>
        <td>${escapeCollectionMonthlyComparisonHtml(benchmark.referenceLabel)}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(benchmark.referenceTotal === null ? "N/A" : formatAmountRM(benchmark.referenceTotal))}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(formatCollectionMonthlyComparisonDifference(benchmark.difference))}</td>
        <td class="numeric">${escapeCollectionMonthlyComparisonHtml(formatCollectionMonthlyComparisonPercentage(benchmark.percentageChange))}</td>
        <td>${escapeCollectionMonthlyComparisonHtml(benchmark.summary)}</td>
      </tr>
    `).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SQR Monthly Comparison Report</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; color: #0f172a; background: #ffffff; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; background: #eef2f7; }
    main { max-width: 980px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe3ef; border-radius: 18px; padding: 28px; box-shadow: 0 18px 60px rgba(15, 23, 42, 0.10); }
    header { display: flex; justify-content: space-between; gap: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 18px; }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; }
    h2 { margin: 26px 0 10px; font-size: 16px; }
    p { margin: 0; line-height: 1.55; }
    .muted { color: #64748b; font-size: 12px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
    .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; background: #f8fafc; }
    .label { margin-bottom: 5px; color: #64748b; font-size: 11px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; }
    .value { font-size: 17px; font-weight: 800; color: #0f172a; }
    .section { margin-top: 22px; }
    .report-chart { width: 100%; height: auto; display: block; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 9px 8px; text-align: left; vertical-align: top; }
    th { color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: .02em; background: #f8fafc; }
    .numeric { text-align: right; white-space: nowrap; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    li { margin: 5px 0; }
    .actions { margin: 18px auto 0; max-width: 980px; text-align: right; }
    .print-button { border: 0; border-radius: 999px; background: #2563eb; color: white; font-weight: 700; padding: 10px 16px; cursor: pointer; }
    @media (max-width: 760px) {
      body { padding: 12px; }
      main { padding: 18px; }
      header { display: block; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      table { font-size: 11px; }
    }
    @media print {
      body { padding: 0; background: #ffffff; }
      main { max-width: none; border: 0; border-radius: 0; box-shadow: none; padding: 18mm 14mm; }
      .actions { display: none; }
      h2, table, .card, .report-chart { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Monthly Collection Comparison</h1>
        <p class="muted">${escapeCollectionMonthlyComparisonHtml(payload.nickname)} - ${escapeCollectionMonthlyComparisonHtml(payload.startMonth)} to ${escapeCollectionMonthlyComparisonHtml(payload.endMonth)}</p>
      </div>
      <div>
        <p class="muted">Generated</p>
        <p>${escapeCollectionMonthlyComparisonHtml(generatedAt)}</p>
      </div>
    </header>

    <section class="grid" aria-label="Report summary">
      <div class="card"><p class="label">Range total</p><p class="value">${escapeCollectionMonthlyComparisonHtml(formatAmountRM(insights.rangeTotal))}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(insights.totalRecords)} record(s)</p></div>
      <div class="card"><p class="label">Target status</p><p class="value">${escapeCollectionMonthlyComparisonHtml(targetStatus)}</p><p class="muted">${targetSummary ? escapeCollectionMonthlyComparisonHtml(`${(targetSummary.targetProgress * 100).toFixed(1)}% of ${formatAmountRM(targetSummary.rangeTarget)}`) : "No target line used"}</p></div>
      <div class="card"><p class="label">Best month</p><p class="value">${escapeCollectionMonthlyComparisonHtml(insights.peakMonth?.label || "No data")}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(insights.peakMonth ? formatAmountRM(insights.peakMonth.totalCollection) : "No collection recorded")}</p></div>
      <div class="card"><p class="label">Audit watch</p><p class="value">${escapeCollectionMonthlyComparisonHtml(anomalySummary)}</p><p class="muted">Threshold ${COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT}%</p></div>
    </section>

    <section class="section">
      <h2>Same-day pace</h2>
      ${sameDayPace ? `
      <div class="grid">
        <div class="card"><p class="label">Current same-day</p><p class="value">${escapeCollectionMonthlyComparisonHtml(formatAmountRM(sameDayPace.currentTotal))}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(sameDayPace.currentRangeLabel)}</p></div>
        <div class="card"><p class="label">Previous same-day</p><p class="value">${escapeCollectionMonthlyComparisonHtml(formatAmountRM(sameDayPace.previousTotal))}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(sameDayPace.previousRangeLabel)}</p></div>
        <div class="card"><p class="label">Same-day gap</p><p class="value">${escapeCollectionMonthlyComparisonHtml(formatCollectionMonthlyComparisonDifference(sameDayPace.difference))}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(sameDayPace.headline)}</p></div>
        <div class="card"><p class="label">Target pace</p><p class="value">${escapeCollectionMonthlyComparisonHtml(sameDayPace.target?.label || "No target")}</p><p class="muted">${escapeCollectionMonthlyComparisonHtml(sameDayPace.target ? formatCollectionMonthlyComparisonDifference(sameDayPace.target.paceGap) : "No configured target")}</p></div>
      </div>
      <p style="margin-top:10px">${escapeCollectionMonthlyComparisonHtml(sameDayPace.summary)}</p>` : `<p>Same-day pace appears when the report is generated for the current month range.</p>`}
      <ul>${sameDayPaceRows}</ul>
    </section>

    <section class="section">
      <h2>Trend explanation</h2>
      <p>${escapeCollectionMonthlyComparisonHtml(trendExplanation)}</p>
      <p class="muted">${escapeCollectionMonthlyComparisonHtml(payload.comparison.summary)}</p>
    </section>

    <section class="section">
      <h2>Benchmark lens</h2>
      <table>
        <thead>
          <tr>
            <th>Benchmark</th>
            <th>Reference</th>
            <th class="numeric">Reference total</th>
            <th class="numeric">Difference</th>
            <th class="numeric">Change</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>${benchmarkRows}</tbody>
      </table>
    </section>

    <section class="section">
      <h2>Chart</h2>
      ${chartSvg}
      <p class="muted">Target source: ${escapeCollectionMonthlyComparisonHtml(options.monthlyTargetSourceLabel || "No configured target source")}</p>
    </section>

    <section class="section">
      <h2>Current month projection</h2>
      <p>${escapeCollectionMonthlyComparisonHtml(projectionSummary)}</p>
      ${projection?.requiredDailyAverageToTarget !== null && projection?.requiredDailyAverageToTarget !== undefined ? `<p class="muted">Required daily average for remaining days: ${escapeCollectionMonthlyComparisonHtml(formatAmountRM(projection.requiredDailyAverageToTarget))}</p>` : ""}
    </section>

    <section class="section">
      <h2>Target and anomaly notes</h2>
      <p>${targetSummary ? escapeCollectionMonthlyComparisonHtml(`Target month target ${formatAmountRM(targetSummary.monthlyTargetAmount)}. Configured range target ${formatAmountRM(targetSummary.rangeTarget)} across ${targetSummary.configuredMonthCount} month(s). Gap ${formatCollectionMonthlyComparisonDifference(targetSummary.targetGap)}.`) : "No configured monthly target was available for this report."}</p>
      <ul>${anomalyRows}</ul>
    </section>

    <section class="section">
      <h2>Data quality checks</h2>
      <p>${escapeCollectionMonthlyComparisonHtml(dataQuality.statusLabel)}</p>
      <ul>${qualityRows}</ul>
    </section>

    <section class="section">
      <h2>Monthly breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th class="numeric">Total</th>
            <th class="numeric">Records</th>
            <th class="numeric">Avg / record</th>
            <th>Vs previous</th>
            <th>Audit</th>
            <th class="numeric">Target gap</th>
          </tr>
        </thead>
        <tbody>${monthRows}</tbody>
      </table>
    </section>
  </main>
  <div class="actions"><button class="print-button" type="button" onclick="window.print()">Print or save PDF</button></div>
  <script>window.addEventListener("load",function(){setTimeout(function(){window.print();},150);});</script>
</body>
</html>`;
}
