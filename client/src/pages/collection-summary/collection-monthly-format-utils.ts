import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import { formatAmountRM } from "@/pages/collection/utils";

const COLLECTION_MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;
const COMPACT_AMOUNT_FORMATTER = new Intl.NumberFormat("en-MY", {
  notation: "compact",
  maximumFractionDigits: 1,
});

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

export function normalizeCollectionMonthInputValue(value: string): string | null {
  const normalized = String(value || "").trim();
  const match = /^(\d{4})-(\d{1,2})$/.exec(normalized);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1] || "", 10);
  const month = Number.parseInt(match[2] || "", 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function formatCollectionMonthInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftCollectionMonthInput(monthKey: string, offset: number): string {
  const parsed = parseCollectionMonthKey(monthKey);
  if (!parsed) {
    return monthKey;
  }

  const nextDate = new Date(parsed.year, parsed.month - 1 + offset, 1, 12);
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

export function formatCollectionMonthName(monthNumber: number): string {
  const date = new Date(2026, monthNumber - 1, 1, 12);
  return date.toLocaleString("en-MY", { month: "long" });
}

export function formatCollectionMonthlyComparisonPercentage(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "No previous month total";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

export function formatCollectionMonthlyComparisonDifference(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/A";
  }
  const formatted = formatAmountRM(Math.abs(value));
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

export function getCollectionDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function formatCollectionSameDayPaceMonthLabel(monthKey: string): string {
  const parsed = parseCollectionMonthKey(monthKey);
  if (!parsed) {
    return monthKey;
  }
  return `${formatCollectionMonthName(parsed.month)} ${parsed.year}`;
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
