import type { CollectionAmountMyrNumber } from "../../../shared/collection-amount-types";

export type CollectionDailyStatus = "green" | "yellow" | "red" | "neutral";

export type CollectionDailyCalendarInput = {
  day: number;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName?: string | null;
};

export type CollectionDailyTimelineDay = {
  day: number;
  date: string;
  amount: CollectionAmountMyrNumber;
  target: CollectionAmountMyrNumber;
  carryIn: CollectionAmountMyrNumber;
  carryOut: CollectionAmountMyrNumber;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  customerCount: number;
  status: CollectionDailyStatus;
};

export type CollectionDailyTimelineSummary = {
  monthlyTarget: CollectionAmountMyrNumber;
  collectedToDate: CollectionAmountMyrNumber;
  collectedAmount: CollectionAmountMyrNumber;
  remainingTarget: CollectionAmountMyrNumber;
  balancedAmount: CollectionAmountMyrNumber;
  workingDays: number;
  elapsedWorkingDays: number;
  remainingWorkingDays: number;
  requiredPerRemainingWorkingDay: CollectionAmountMyrNumber;
  completedDays: number;
  incompleteDays: number;
  noCollectionDays: number;
  neutralDays: number;
  baseDailyTarget: CollectionAmountMyrNumber;
  dailyTarget: CollectionAmountMyrNumber;
  expectedProgressAmount: CollectionAmountMyrNumber;
  progressVarianceAmount: CollectionAmountMyrNumber;
};

export type CollectionDailyTimeline = {
  daysInMonth: number;
  days: CollectionDailyTimelineDay[];
  summary: CollectionDailyTimelineSummary;
};

export type CollectionDailyOverviewSummary = CollectionDailyTimelineSummary & {
  achievedAmount: CollectionAmountMyrNumber;
  remainingAmount: CollectionAmountMyrNumber;
  metDays: number;
  yellowDays: number;
  redDays: number;
};

export type CollectionDailyTimelineAggregate = {
  daysInMonth: number;
  days: CollectionDailyTimelineDay[];
  summary: CollectionDailyOverviewSummary;
};

export type ComputeCollectionDailyTimelineParams = {
  year: number;
  month: number;
  monthlyTarget: CollectionAmountMyrNumber;
  calendarRows: CollectionDailyCalendarInput[];
  amountByDate: Map<string, CollectionAmountMyrNumber>;
  customerCountByDate?: Map<string, number>;
  referenceDate?: Date;
};
