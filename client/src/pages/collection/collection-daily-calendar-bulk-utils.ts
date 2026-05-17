import type { CollectionDailyOverviewDay } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import type {
  CollectionDailyCalendarStatus,
  CollectionDailyLeaveType,
} from "@shared/collection-daily-status";

export type CollectionDailyCalendarBulkDraft = {
  status: CollectionDailyCalendarStatus;
  leaveType: CollectionDailyLeaveType | null;
  note: string;
};

export const DEFAULT_COLLECTION_DAILY_BULK_DRAFT: CollectionDailyCalendarBulkDraft = {
  status: "HOLIDAY",
  leaveType: "OFF",
  note: "",
};

export function buildCollectionDailyBulkPatch(
  draft: CollectionDailyCalendarBulkDraft,
): Partial<EditableCalendarDay> {
  if (draft.status === "WORKING") {
    return {
      status: "WORKING",
      leaveType: null,
      note: "",
      holidayName: "",
      isWorkingDay: true,
      isHoliday: false,
    };
  }

  return {
    status: "HOLIDAY",
    leaveType: draft.leaveType,
    note: draft.note.trim(),
    holidayName: draft.leaveType ?? draft.note.trim(),
    isWorkingDay: false,
    isHoliday: true,
  };
}

export function getCollectionDailyBulkSelectableDays(days: CollectionDailyOverviewDay[]) {
  return days.map((day) => day.day);
}

export function toggleCollectionDailyBulkDay(
  previous: ReadonlySet<number>,
  day: number,
): Set<number> {
  const next = new Set(previous);
  if (next.has(day)) {
    next.delete(day);
  } else {
    next.add(day);
  }
  return next;
}

export function hasCollectionDailyBulkDraftError(
  selectedDayNumbers: ReadonlySet<number>,
  draft: CollectionDailyCalendarBulkDraft,
) {
  return selectedDayNumbers.size === 0 || (draft.status === "HOLIDAY" && !draft.leaveType);
}
