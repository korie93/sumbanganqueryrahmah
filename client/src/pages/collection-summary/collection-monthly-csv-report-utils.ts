import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { COLLECTION_MONTHLY_COMPARISON_ANOMALY_THRESHOLD_PERCENT } from "./collection-monthly-anomaly-utils";
import {
  resolveCollectionMonthlyComparisonTargetForMonth,
  type CollectionMonthlyComparisonTargetInput,
  type CollectionMonthlyComparisonTargetLookup,
} from "./collection-monthly-target-utils";
import { escapeCollectionMonthlyComparisonCsvValue } from "./collection-monthly-export-utils";
import {
  buildCollectionSameDayPacePointInsights,
  buildCollectionSameDayPacePointTrendLabel,
  type CollectionSameDayPaceComparison,
} from "./collection-monthly-same-day-utils";
import {
  buildCollectionMonthlyComparisonInsights,
} from "./collection-monthly-summary-utils";

export type CollectionMonthlyComparisonCsvOptions = {
  monthlyTargetAmount?: number | null | undefined;
  monthlyTargetsByMonth?: CollectionMonthlyComparisonTargetLookup | undefined;
  sameDayPace?: CollectionSameDayPaceComparison | null | undefined;
};

function isCollectionMonthlyComparisonCsvOptions(
  options: number | null | undefined | CollectionMonthlyComparisonCsvOptions,
): options is CollectionMonthlyComparisonCsvOptions {
  return Boolean(
    options
    && typeof options === "object"
    && ("monthlyTargetAmount" in options || "monthlyTargetsByMonth" in options || "sameDayPace" in options),
  );
}

function resolveCollectionMonthlyComparisonCsvTargetInput(
  options: number | null | undefined | CollectionMonthlyComparisonCsvOptions,
): CollectionMonthlyComparisonTargetInput {
  if (isCollectionMonthlyComparisonCsvOptions(options)) {
    return options.monthlyTargetsByMonth ?? options.monthlyTargetAmount ?? null;
  }

  return options as number | null | undefined;
}

function resolveCollectionMonthlyComparisonCsvSameDayPace(
  options: number | null | undefined | CollectionMonthlyComparisonCsvOptions,
): CollectionSameDayPaceComparison | null {
  if (isCollectionMonthlyComparisonCsvOptions(options)) {
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
    "Month",
    "Daily Collection",
    "Cumulative Collection",
    "Previous Month Date",
    "Previous Month",
    "Previous Month Daily Collection",
    "Previous Month Cumulative Collection",
    "Daily Difference",
    "Cumulative Difference",
    "Current Monthly Target",
    "Previous Monthly Target",
    "Target Progress %",
    "Workday/Holiday Status",
    "Previous Workday/Holiday Status",
    "Pace Status",
    "Pace Insight",
  ];
  const sameDayRows = sameDayPace.points.map((point) => {
    const target = sameDayPace.target?.monthlyTargetAmount ?? null;
    const targetProgress = target === null ? null : (point.currentCumulative / target) * 100;
    const pointInsights = buildCollectionSameDayPacePointInsights(point, sameDayPace);
    return [
      point.currentDate,
      sameDayPace.currentLabel,
      point.currentAmount.toFixed(2),
      point.currentCumulative.toFixed(2),
      point.previousDate,
      sameDayPace.previousLabel,
      point.previousAmount.toFixed(2),
      point.previousCumulative.toFixed(2),
      point.dailyDifference.toFixed(2),
      point.cumulativeDifference.toFixed(2),
      target === null ? "" : target.toFixed(2),
      sameDayPace.previousMonthlyTargetAmount === null ? "" : sameDayPace.previousMonthlyTargetAmount.toFixed(2),
      targetProgress === null ? "" : targetProgress.toFixed(2),
      point.currentStatus.label,
      point.previousStatus.label,
      buildCollectionSameDayPacePointTrendLabel(point),
      pointInsights[0] || "",
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
