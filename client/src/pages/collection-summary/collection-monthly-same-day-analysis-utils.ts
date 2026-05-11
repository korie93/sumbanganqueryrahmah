import { resolveCollectionSameDayPercentageChange } from "./collection-monthly-stat-utils";
import type {
  CollectionSameDayPaceConsistency,
  CollectionSameDayPaceDayRange,
  CollectionSameDayPaceMomentum,
  CollectionSameDayPacePoint,
  CollectionSameDayPaceTarget,
} from "./collection-monthly-same-day-types";

export function buildCollectionSameDayPaceMomentum(points: CollectionSameDayPacePoint[]): CollectionSameDayPaceMomentum {
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
  const splitCalendarDay = points[Math.max(0, splitDay - 1)]?.day ?? splitDay;
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
      description: `Current month pace weakened after day ${splitCalendarDay}.`,
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
      description: `Current month pace strengthened after day ${splitCalendarDay}.`,
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

export function buildCollectionSameDayPaceConsistency(points: CollectionSameDayPacePoint[]): CollectionSameDayPaceConsistency {
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

export function buildCollectionSameDayPaceTarget(input: {
  monthlyTargetAmount?: number | null | undefined;
  currentTotal: number;
  currentDailyAverage: number;
  comparedDayCount: number;
  totalDaysInCurrentMonth: number;
}): CollectionSameDayPaceTarget | null {
  const monthlyTargetAmount = Number(input.monthlyTargetAmount || 0);
  if (!Number.isFinite(monthlyTargetAmount) || monthlyTargetAmount <= 0) {
    return null;
  }

  const expectedByToday = (monthlyTargetAmount * input.comparedDayCount) / input.totalDaysInCurrentMonth;
  const expectedProgress = monthlyTargetAmount > 0 ? input.currentTotal / monthlyTargetAmount : 0;
  const paceGap = input.currentTotal - expectedByToday;
  const projectedTotal = input.currentDailyAverage * input.totalDaysInCurrentMonth;
  const projectedTargetGap = projectedTotal - monthlyTargetAmount;
  const remainingDays = Math.max(0, input.totalDaysInCurrentMonth - input.comparedDayCount);
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

export function resolveCollectionSameDayComparisonRange(input: {
  dayRange?: CollectionSameDayPaceDayRange | null | undefined;
  maxComparisonDay: number;
  rawComparisonDay: number;
  totalDaysInCurrentMonth: number;
}) {
  const requestedStartDay = input.dayRange
    ? Math.trunc(Number(input.dayRange.startDay || 1))
    : 1;
  const requestedEndDay = input.dayRange
    ? Math.trunc(Number(input.dayRange.endDay || input.maxComparisonDay))
    : input.rawComparisonDay;
  const lowerRequestedDay = Math.min(requestedStartDay, requestedEndDay);
  const upperRequestedDay = Math.max(requestedStartDay, requestedEndDay);
  const startDay = Math.min(input.maxComparisonDay, Math.max(1, lowerRequestedDay));
  const comparisonDay = Math.min(input.maxComparisonDay, Math.max(startDay, upperRequestedDay));
  const endDay = comparisonDay;
  const comparedDayCount = Math.max(1, endDay - startDay + 1);
  const rangeCappedByPreviousMonth = upperRequestedDay > input.maxComparisonDay
    || input.maxComparisonDay < Math.min(input.totalDaysInCurrentMonth, Math.max(1, input.rawComparisonDay));

  return {
    startDay,
    endDay,
    comparisonDay,
    comparedDayCount,
    rangeCappedByPreviousMonth,
  };
}