import type { CollectionDailyOverviewDay } from "@/lib/api";

export type CollectionDailyCalendarProgressBand =
  | "empty"
  | "low"
  | "medium"
  | "high"
  | "complete";

export function getCollectionDailyCalendarProgressPercent(
  day: CollectionDailyOverviewDay,
): number {
  if (!Number.isFinite(day.amount) || !Number.isFinite(day.target)) return 0;
  if (day.target <= 0) return day.amount > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, (day.amount / day.target) * 100));
}

export function getCollectionDailyCalendarProgressBand(
  day: CollectionDailyOverviewDay,
): CollectionDailyCalendarProgressBand {
  const percent = getCollectionDailyCalendarProgressPercent(day);

  if (percent <= 0) return "empty";
  if (percent < 50) return "low";
  if (percent < 90) return "medium";
  if (percent < 100) return "high";
  return "complete";
}
