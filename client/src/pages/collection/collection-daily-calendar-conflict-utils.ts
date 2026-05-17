import type { CollectionDailyOverviewDay } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

export function hasCollectionDailyCalendarCollectionConflict(
  day: CollectionDailyOverviewDay,
  editableDay: EditableCalendarDay,
) {
  return (
    editableDay.status === "HOLIDAY"
    && (Number(day.amount) > 0 || Number(day.customerCount) > 0)
  );
}

