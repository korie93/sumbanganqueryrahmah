import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";
import {
  formatCollectionMonthInput,
  formatCollectionMonthlyComparisonDifference,
  formatCollectionMonthlyComparisonPercentage,
  getCollectionDaysInMonth,
  parseCollectionMonthKey,
  shiftCollectionMonthInput,
} from "./collection-monthly-format-utils";
import {
  COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT,
  resolveCollectionMonthlyComparisonAnomaly,
  type CollectionMonthlyComparisonAnomalyDirection,
} from "./collection-monthly-anomaly-utils";
import {
  buildCollectionMonthlyComparisonTargetSummary,
  resolveCollectionMonthlyComparisonTargetForMonth,
  type CollectionMonthlyComparisonTargetInput,
} from "./collection-monthly-target-utils";
import {
  resolveCollectionMonthlyComparisonBenchmarkDirection,
  resolveCollectionMonthlyComparisonPercentageChange,
} from "./collection-monthly-stat-utils";

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