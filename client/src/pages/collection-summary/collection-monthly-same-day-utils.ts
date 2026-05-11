import { formatAmountRM } from "@/pages/collection/utils";
import {
  formatCollectionMonthlyComparisonDifference,
  formatCollectionSameDayPaceDisplayDate,
  formatCollectionSameDayPaceMonthLabel,
  getCollectionDaysInMonth,
  parseCollectionMonthKey,
  shiftCollectionMonthInput,
} from "./collection-monthly-format-utils";
import {
  normalizeCollectionSameDayAmount,
  resolveCollectionSameDayPercentageChange,
} from "./collection-monthly-stat-utils";
import {
  buildCollectionSameDayPaceCalendarStatus,
  formatCollectionSameDayPaceDate,
  formatCollectionSameDayPacePercent,
  formatCollectionSameDayPaceRangeLabel,
} from "./collection-monthly-same-day-status-utils";
import {
  buildCollectionSameDayPaceConsistency,
  buildCollectionSameDayPaceMomentum,
  buildCollectionSameDayPaceTarget,
  resolveCollectionSameDayComparisonRange,
} from "./collection-monthly-same-day-analysis-utils";
import type {
  CollectionSameDayPaceComparison,
  CollectionSameDayPaceDailyInput,
  CollectionSameDayPaceDayRange,
  CollectionSameDayPacePoint,
} from "./collection-monthly-same-day-types";

export {
  buildCollectionSameDayPacePointInsights,
  buildCollectionSameDayPacePointTrendLabel,
} from "./collection-monthly-same-day-insight-utils";
export type {
  CollectionSameDayPaceCalendarStatus,
  CollectionSameDayPaceComparison,
  CollectionSameDayPaceConsistency,
  CollectionSameDayPaceDailyInput,
  CollectionSameDayPaceDayRange,
  CollectionSameDayPaceMomentum,
  CollectionSameDayPacePoint,
  CollectionSameDayPaceTarget,
} from "./collection-monthly-same-day-types";

export function buildCollectionSameDayPaceComparison(input: {
  currentMonthKey: string;
  previousMonthKey?: string | undefined;
  currentDaily: CollectionSameDayPaceDailyInput[];
  previousDaily: CollectionSameDayPaceDailyInput[];
  monthlyTargetAmount?: number | null | undefined;
  previousMonthlyTargetAmount?: number | null | undefined;
  dayRange?: CollectionSameDayPaceDayRange | null | undefined;
  referenceDate?: Date | undefined;
}): CollectionSameDayPaceComparison | null {
  if (input.referenceDate && !Number.isFinite(input.referenceDate.getTime())) {
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
  const rawComparisonDay = totalDaysInCurrentMonth;
  const maxComparisonDay = Math.min(
    totalDaysInCurrentMonth,
    totalDaysInPreviousMonth,
  );
  const {
    startDay,
    endDay,
    comparisonDay,
    comparedDayCount,
    rangeCappedByPreviousMonth,
  } = resolveCollectionSameDayComparisonRange({
    dayRange: input.dayRange,
    maxComparisonDay,
    rawComparisonDay,
    totalDaysInCurrentMonth,
  });
  const currentByDay = new Map<number, CollectionSameDayPaceDailyInput>();
  const previousByDay = new Map<number, CollectionSameDayPaceDailyInput>();

  for (const day of input.currentDaily) {
    const dayNumber = Math.max(1, Math.trunc(Number(day.day || 0)));
    if (dayNumber <= totalDaysInCurrentMonth) {
      currentByDay.set(dayNumber, day);
    }
  }
  for (const day of input.previousDaily) {
    const dayNumber = Math.max(1, Math.trunc(Number(day.day || 0)));
    if (dayNumber <= totalDaysInPreviousMonth) {
      previousByDay.set(dayNumber, day);
    }
  }

  let currentCumulative = 0;
  let previousCumulative = 0;
  const points: CollectionSameDayPacePoint[] = [];
  for (let day = startDay; day <= endDay; day += 1) {
    const currentDay = currentByDay.get(day) || null;
    const previousDay = previousByDay.get(day) || null;
    const currentAmount = normalizeCollectionSameDayAmount(currentDay?.amount || 0);
    const previousAmount = normalizeCollectionSameDayAmount(previousDay?.amount || 0);
    currentCumulative += currentAmount;
    previousCumulative += previousAmount;
    points.push({
      day,
      rangeIndex: day - startDay + 1,
      currentDate: formatCollectionSameDayPaceDate(input.currentMonthKey, day),
      previousDate: formatCollectionSameDayPaceDate(previousMonthKey, day),
      currentAmount,
      previousAmount,
      currentCumulative,
      previousCumulative,
      dailyDifference: currentAmount - previousAmount,
      cumulativeDifference: currentCumulative - previousCumulative,
      currentStatus: buildCollectionSameDayPaceCalendarStatus(currentDay),
      previousStatus: buildCollectionSameDayPaceCalendarStatus(previousDay),
    });
  }

  const currentTotal = currentCumulative;
  const previousTotal = previousCumulative;
  const difference = currentTotal - previousTotal;
  const percentageChange = resolveCollectionSameDayPercentageChange(currentTotal, previousTotal);
  const currentDailyAverage = currentTotal / comparedDayCount;
  const previousDailyAverage = previousTotal / comparedDayCount;
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
  const currentRangeLabel = formatCollectionSameDayPaceRangeLabel(input.currentMonthKey, startDay, endDay);
  const previousRangeLabel = formatCollectionSameDayPaceRangeLabel(previousMonthKey, startDay, endDay);
  const momentum = buildCollectionSameDayPaceMomentum(points);
  const consistency = buildCollectionSameDayPaceConsistency(points);
  const target = buildCollectionSameDayPaceTarget({
    monthlyTargetAmount: input.monthlyTargetAmount,
    currentTotal,
    currentDailyAverage,
    comparedDayCount,
    totalDaysInCurrentMonth,
  });
  const currentMonthlyTargetAmount = target?.monthlyTargetAmount ?? null;
  const normalizedPreviousTarget = Number(input.previousMonthlyTargetAmount || 0);
  const previousMonthlyTargetAmount = Number.isFinite(normalizedPreviousTarget) && normalizedPreviousTarget > 0
    ? normalizedPreviousTarget
    : null;

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

  const currentNonWorkingCount = points.filter((point) => point.currentStatus.tone === "non_working").length;
  const previousNonWorkingCount = points.filter((point) => point.previousStatus.tone === "non_working").length;
  const workingDayMismatch = points.find((point) => point.currentStatus.tone !== point.previousStatus.tone) || null;

  if (workingDayMismatch) {
    const currentDate = formatCollectionSameDayPaceDisplayDate(workingDayMismatch.currentDate);
    const previousDate = formatCollectionSameDayPaceDisplayDate(workingDayMismatch.previousDate);
    if (workingDayMismatch.previousStatus.tone === "non_working" && workingDayMismatch.currentStatus.tone === "working") {
      insights.push(`${previousDate} was holiday/non-working while ${currentDate} was a working day. This may affect pace comparison accuracy.`);
    } else if (workingDayMismatch.currentStatus.tone === "non_working" && workingDayMismatch.previousStatus.tone === "working") {
      insights.push(`${currentDate} was holiday/non-working while ${previousDate} was a working day. Slower collection may be calendar-driven.`);
    }
  } else if (currentNonWorkingCount > 0 || previousNonWorkingCount > 0) {
    insights.push(`${currentNonWorkingCount} current-range and ${previousNonWorkingCount} previous-range non-working day(s) are included in this comparison.`);
  }

  if (target) {
    insights.push(
      target.status === "on_track"
        ? `Selected range pace is ahead of target expectation by ${formatAmountRM(Math.abs(target.paceGap))}.`
        : `Selected range pace is behind target expectation by ${formatAmountRM(Math.abs(target.paceGap))}.`,
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
    startDay,
    endDay,
    comparisonDay,
    comparedDayCount,
    currentRangeLabel,
    previousRangeLabel,
    totalDaysInCurrentMonth,
    totalDaysInPreviousMonth,
    rangeCappedByPreviousMonth,
    currentMonthlyTargetAmount,
    previousMonthlyTargetAmount,
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