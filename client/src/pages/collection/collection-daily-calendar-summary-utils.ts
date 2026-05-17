import type { CollectionDailyOverviewDay } from "@/lib/api";

export type CollectionDailyCalendarStatusSummary = {
  totalDays: number;
  workingDays: number;
  holidayDays: number;
  offDays: number;
  unsavedChanges: number;
};

export function summarizeCollectionDailyCalendarStatus(
  days: CollectionDailyOverviewDay[],
  dirtyCalendarDayNumbers: ReadonlySet<number>,
): CollectionDailyCalendarStatusSummary {
  return days.reduce<CollectionDailyCalendarStatusSummary>(
    (summary, day) => {
      summary.totalDays += 1;

      if (day.calendarStatus === "WORKING") {
        summary.workingDays += 1;
      } else {
        summary.holidayDays += 1;
        if (day.leaveType === "OFF") {
          summary.offDays += 1;
        }
      }

      if (dirtyCalendarDayNumbers.has(day.day)) {
        summary.unsavedChanges += 1;
      }

      return summary;
    },
    {
      totalDays: 0,
      workingDays: 0,
      holidayDays: 0,
      offDays: 0,
      unsavedChanges: 0,
    },
  );
}
