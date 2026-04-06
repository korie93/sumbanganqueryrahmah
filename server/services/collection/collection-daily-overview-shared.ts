import {
  aggregateCollectionDailyTimelines,
  computeCollectionDailyTimeline,
} from "./collection-daily-utils";

export type DailyOverviewTimelineSummary = ReturnType<typeof aggregateCollectionDailyTimelines>["summary"];
export const DAILY_OVERVIEW_FALLBACK_PAGE_SIZE = 1000;

export type DailyResolvedUser = {
  id: string;
  username: string;
  role: string;
};

export type DailySummaryEntry = {
  amountByDate: Map<string, number>;
  customerCountByDate: Map<string, number>;
};

export type DailyOverviewBundle = {
  user: DailyResolvedUser;
  timeline: ReturnType<typeof computeCollectionDailyTimeline>;
};

export type DailyOverviewComputation = {
  selectedUsers: DailyResolvedUser[];
  summary: DailyOverviewTimelineSummary;
  daysInMonth: number;
  days: Array<{
    day: number;
    date: string;
    amount: number;
    target: number;
    isWorkingDay: boolean;
    isHoliday: boolean;
    holidayName: string | null;
    customerCount: number;
    status: "green" | "yellow" | "red" | "neutral";
  }>;
};

export function roundDailyOverviewMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function createDailySummaryEntry(): DailySummaryEntry {
  return {
    amountByDate: new Map<string, number>(),
    customerCountByDate: new Map<string, number>(),
  };
}
