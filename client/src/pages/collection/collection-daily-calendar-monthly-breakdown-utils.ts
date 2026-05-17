import type { CollectionDailyOverviewDay } from "@/lib/api";
import { COLLECTION_DAILY_LEAVE_TYPES, type CollectionDailyLeaveType } from "@shared/collection-daily-status";

export type CollectionDailyCalendarMonthlyBreakdown = {
  totalDays: number;
  workingDays: number;
  holidayDays: number;
  workingAmount: number;
  holidayAmount: number;
  conflictDays: number;
  leaveTypeCounts: Record<CollectionDailyLeaveType, number>;
};

function createLeaveTypeCounts(): Record<CollectionDailyLeaveType, number> {
  return COLLECTION_DAILY_LEAVE_TYPES.reduce<Record<CollectionDailyLeaveType, number>>(
    (counts, leaveType) => {
      counts[leaveType] = 0;
      return counts;
    },
    {
      AL: 0,
      MC: 0,
      EL: 0,
      UL: 0,
      RL: 0,
      OFF: 0,
    },
  );
}

export function summarizeCollectionDailyCalendarMonthlyBreakdown(
  days: CollectionDailyOverviewDay[],
): CollectionDailyCalendarMonthlyBreakdown {
  return days.reduce<CollectionDailyCalendarMonthlyBreakdown>(
    (summary, day) => {
      summary.totalDays += 1;

      if (day.calendarStatus === "WORKING") {
        summary.workingDays += 1;
        summary.workingAmount += day.amount;
      } else {
        summary.holidayDays += 1;
        summary.holidayAmount += day.amount;
        if (day.leaveType) {
          summary.leaveTypeCounts[day.leaveType] += 1;
        }
        if (day.amount > 0 || day.customerCount > 0) {
          summary.conflictDays += 1;
        }
      }

      return summary;
    },
    {
      totalDays: 0,
      workingDays: 0,
      holidayDays: 0,
      workingAmount: 0,
      holidayAmount: 0,
      conflictDays: 0,
      leaveTypeCounts: createLeaveTypeCounts(),
    },
  );
}
