import type { CollectionMonthlyComparisonResponse } from "@/lib/api";
import {
  formatCollectionMonthInput,
  getCollectionDaysInMonth,
  parseCollectionMonthKey,
} from "./collection-monthly-format-utils";
import {
  resolveCollectionMonthlyComparisonTargetForMonth,
  type CollectionMonthlyComparisonTargetInput,
} from "./collection-monthly-target-utils";

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
