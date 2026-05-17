import type { CollectionDailyOverviewDay } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { hasCollectionDailyCalendarCollectionConflict } from "@/pages/collection/collection-daily-calendar-conflict-utils";
import { COLLECTION_DAILY_LEAVE_TYPE_LABELS } from "@shared/collection-daily-status";

export type CollectionDailyCalendarChangeReviewItem = {
  day: number;
  date: string;
  label: string;
  detail: string;
  note: string;
  missingLeaveType: boolean;
  hasCollectionConflict: boolean;
};

export function describeEditableCalendarDayStatus(day: EditableCalendarDay) {
  if (day.status === "WORKING") {
    return {
      label: "Working",
      detail: "Hari bekerja untuk nickname dipilih.",
      missingLeaveType: false,
    };
  }

  if (!day.leaveType) {
    return {
      label: "Holiday / Leave",
      detail: "Leave type belum dipilih.",
      missingLeaveType: true,
    };
  }

  return {
    label: day.leaveType,
    detail: COLLECTION_DAILY_LEAVE_TYPE_LABELS[day.leaveType],
    missingLeaveType: false,
  };
}

export function buildCollectionDailyCalendarChangeReviewItems(options: {
  days: CollectionDailyOverviewDay[];
  editableCalendarByDay: ReadonlyMap<number, EditableCalendarDay>;
  dirtyCalendarDayNumbers: ReadonlySet<number>;
}) {
  const { days, editableCalendarByDay, dirtyCalendarDayNumbers } = options;

  if (!days.length || dirtyCalendarDayNumbers.size === 0) {
    return [];
  }

  return days
    .filter((day) => dirtyCalendarDayNumbers.has(day.day))
    .map((day): CollectionDailyCalendarChangeReviewItem | null => {
      const editableDay = editableCalendarByDay.get(day.day);
      if (!editableDay) return null;

      const status = describeEditableCalendarDayStatus(editableDay);

      return {
        day: day.day,
        date: day.date,
        label: status.label,
        detail: status.detail,
        note: editableDay.note.trim(),
        missingLeaveType: status.missingLeaveType,
        hasCollectionConflict: hasCollectionDailyCalendarCollectionConflict(day, editableDay),
      };
    })
    .filter((item): item is CollectionDailyCalendarChangeReviewItem => Boolean(item));
}
