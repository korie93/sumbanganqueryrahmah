import type { CollectionDailyOverviewDay } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { hasCollectionDailyCalendarCollectionConflict } from "@/pages/collection/collection-daily-calendar-conflict-utils";

export type CollectionDailyCalendarConflictReportItem = {
  day: CollectionDailyOverviewDay;
  source: "saved" | "draft";
};

export function buildCollectionDailyCalendarConflictReportItems(
  days: CollectionDailyOverviewDay[],
  editableCalendarByDay: ReadonlyMap<number, EditableCalendarDay>,
  dirtyCalendarDayNumbers: ReadonlySet<number>,
): CollectionDailyCalendarConflictReportItem[] {
  return days.reduce<CollectionDailyCalendarConflictReportItem[]>((items, day) => {
    const editableDay = editableCalendarByDay.get(day.day);
    const hasSavedConflict =
      day.calendarStatus === "HOLIDAY" && (day.amount > 0 || day.customerCount > 0);
    const hasDraftConflict =
      editableDay && dirtyCalendarDayNumbers.has(day.day)
        ? hasCollectionDailyCalendarCollectionConflict(day, editableDay)
        : false;

    if (hasDraftConflict) {
      items.push({ day, source: "draft" });
    } else if (hasSavedConflict) {
      items.push({ day, source: "saved" });
    }

    return items;
  }, []);
}
