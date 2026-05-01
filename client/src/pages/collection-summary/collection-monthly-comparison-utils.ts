import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

export const COLLECTION_MONTHLY_COMPARISON_MAX_RANGE_MONTHS = 24;

const COLLECTION_MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;

function parseCollectionMonthKey(value: string) {
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
  const startMonth = shiftCollectionMonthInput(endMonth, -5);
  return {
    startMonth,
    endMonth,
  };
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
    return "—";
  }
  const absoluteValue = Math.abs(value);
  const formatted = formatAmountRM(absoluteValue);
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted;
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
