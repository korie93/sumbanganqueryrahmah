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

export function buildCollectionMonthlyComparisonTargetSummary(
  payload: CollectionMonthlyComparisonResponse,
  monthlyTargetAmount: number | null | undefined,
): CollectionMonthlyComparisonTargetSummary | null {
  const target = Number(monthlyTargetAmount || 0);
  if (!Number.isFinite(target) || target <= 0) {
    return null;
  }

  const insights = buildCollectionMonthlyComparisonInsights(payload);
  const rangeTarget = target * payload.months.length;

  return {
    monthlyTargetAmount: target,
    rangeTarget,
    targetGap: insights.rangeTotal - rangeTarget,
    targetProgress: rangeTarget > 0 ? insights.rangeTotal / rangeTarget : 0,
    monthsAtOrAboveTarget: payload.months.filter((month) => month.totalCollection >= target).length,
    monthsBelowTarget: payload.months.filter((month) => month.totalCollection < target).length,
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

export function buildCollectionMonthlyComparisonCsv(
  payload: CollectionMonthlyComparisonResponse,
  monthlyTargetAmount?: number | null,
): string {
  const insights = buildCollectionMonthlyComparisonInsights(payload);
  const targetSummary = buildCollectionMonthlyComparisonTargetSummary(payload, monthlyTargetAmount);
  const target = targetSummary?.monthlyTargetAmount ?? null;
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
    "Target Status",
  ];
  const rows = insights.monthInsights.map((month) => {
    const targetDifference = target === null ? null : month.totalCollection - target;
    const targetStatus = target === null
      ? ""
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
      targetStatus,
    ];
  });

  return [
    headers.map(escapeCollectionMonthlyComparisonCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCollectionMonthlyComparisonCsvValue).join(",")),
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
