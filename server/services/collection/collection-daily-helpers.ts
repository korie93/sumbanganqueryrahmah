import { parseCollectionAmountMyrNumber } from "../../../shared/collection-amount-types";
import type {
  CollectionDailyOverviewSummary,
  CollectionDailyStatus,
} from "./collection-daily-types";

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getRequiredPerRemainingWorkingDay(
  remainingTarget: number,
  remainingWorkingDays: number,
): number {
  if (remainingWorkingDays <= 0) return 0;
  return roundMoney(Math.max(0, remainingTarget) / remainingWorkingDays);
}

export function buildDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isDefaultWorkingDay(year: number, month: number, day: number): boolean {
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday !== 0 && weekday !== 6;
}

export function getElapsedWorkingDaysCount(
  year: number,
  month: number,
  workingFlags: boolean[],
  referenceDate: Date,
): number {
  const daysInMonth = workingFlags.length;
  const referenceYear = referenceDate.getFullYear();
  const referenceMonth = referenceDate.getMonth() + 1;
  const referenceDay = referenceDate.getDate();

  if (referenceYear < year || (referenceYear === year && referenceMonth < month)) {
    return 0;
  }

  const effectiveLastDay =
    referenceYear > year || (referenceYear === year && referenceMonth > month)
      ? daysInMonth
      : Math.min(daysInMonth, Math.max(0, referenceDay));

  let elapsedWorkingDays = 0;
  for (let day = 1; day <= effectiveLastDay; day += 1) {
    if (workingFlags[day - 1]) {
      elapsedWorkingDays += 1;
    }
  }

  return elapsedWorkingDays;
}

export function getCollectionDailyStatus(params: {
  isWorkingDay: boolean;
  amount: number;
  target: number;
}): CollectionDailyStatus {
  const amount = roundMoney(Math.max(0, parseCollectionAmountMyrNumber(params.amount || 0)));
  const target = roundMoney(Math.max(0, parseCollectionAmountMyrNumber(params.target || 0)));
  if (!params.isWorkingDay) {
    return "neutral";
  }
  if (target <= 0) {
    return amount > 0 ? "green" : "neutral";
  }
  if (amount <= 0) {
    return "red";
  }
  if (amount < target) {
    return "yellow";
  }
  return "green";
}

export function getCollectionDailyStatusMessage(status: CollectionDailyStatus): string {
  if (status === "neutral") return "Holiday / non-working day or no required target for this day.";
  if (status === "red") return "No collection on this working day.";
  if (status === "yellow") return "Collection recorded but daily target not achieved.";
  return "Daily target achieved.";
}

export function buildEmptyCollectionDailyOverviewSummary(): CollectionDailyOverviewSummary {
  return {
    monthlyTarget: 0,
    collectedToDate: 0,
    collectedAmount: 0,
    remainingTarget: 0,
    balancedAmount: 0,
    workingDays: 0,
    elapsedWorkingDays: 0,
    remainingWorkingDays: 0,
    requiredPerRemainingWorkingDay: 0,
    completedDays: 0,
    incompleteDays: 0,
    noCollectionDays: 0,
    neutralDays: 0,
    baseDailyTarget: 0,
    dailyTarget: 0,
    expectedProgressAmount: 0,
    progressVarianceAmount: 0,
    achievedAmount: 0,
    remainingAmount: 0,
    metDays: 0,
    yellowDays: 0,
    redDays: 0,
  };
}
