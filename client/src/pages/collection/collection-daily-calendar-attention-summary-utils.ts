import type { CollectionDailyOverviewDay } from "@/lib/api";
import { formatDateKeyInMalaysia } from "@/lib/date-format";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { buildCollectionDailyCalendarConflictReportItems } from "@/pages/collection/collection-daily-calendar-conflict-report-utils";

export type CollectionDailyCalendarAttentionSummary = {
  holidayWithCollectionCount: number;
  workingWithoutCollectionCount: number;
  unsavedChangesCount: number;
  tone: "calm" | "notice" | "warning";
  title: string;
  description: string;
};

function isOnOrBeforeDateKey(dateKey: string, todayKey: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey <= todayKey;
}

export function buildCollectionDailyCalendarAttentionSummary(options: {
  days: CollectionDailyOverviewDay[];
  editableCalendarByDay: ReadonlyMap<number, EditableCalendarDay>;
  dirtyCalendarDayNumbers: ReadonlySet<number>;
  todayKey?: string;
}): CollectionDailyCalendarAttentionSummary {
  const { days, editableCalendarByDay, dirtyCalendarDayNumbers } = options;
  const todayKey = options.todayKey || formatDateKeyInMalaysia(new Date());
  const holidayWithCollectionCount = buildCollectionDailyCalendarConflictReportItems(
    days,
    editableCalendarByDay,
    dirtyCalendarDayNumbers,
  ).length;
  const workingWithoutCollectionCount = days.filter((day) => {
    if (!isOnOrBeforeDateKey(day.date, todayKey)) return false;
    const editableDay = editableCalendarByDay.get(day.day);
    const effectiveStatus =
      editableDay && dirtyCalendarDayNumbers.has(day.day) ? editableDay.status : day.calendarStatus;
    return effectiveStatus === "WORKING" && day.amount <= 0 && day.customerCount <= 0;
  }).length;
  const unsavedChangesCount = dirtyCalendarDayNumbers.size;

  if (holidayWithCollectionCount > 0) {
    return {
      holidayWithCollectionCount,
      workingWithoutCollectionCount,
      unsavedChangesCount,
      tone: "warning",
      title: "Perlu semak sebelum audit",
      description: `${holidayWithCollectionCount} hari Holiday/OFF masih ada kutipan.`,
    };
  }

  if (workingWithoutCollectionCount > 0 || unsavedChangesCount > 0) {
    return {
      holidayWithCollectionCount,
      workingWithoutCollectionCount,
      unsavedChangesCount,
      tone: "notice",
      title: "Ada perkara untuk disemak",
      description:
        workingWithoutCollectionCount > 0
          ? `${workingWithoutCollectionCount} working day setakat hari ini tiada kutipan.`
          : `${unsavedChangesCount} perubahan status belum disimpan.`,
    };
  }

  return {
    holidayWithCollectionCount,
    workingWithoutCollectionCount,
    unsavedChangesCount,
    tone: "calm",
    title: "Calendar nampak stabil",
    description: "Tiada conflict utama dikesan untuk nickname dan bulan ini.",
  };
}
