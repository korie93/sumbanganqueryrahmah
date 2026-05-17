import { formatDateDDMMYYYY } from "@/lib/date-format";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";
import { COLLECTION_DAILY_LEAVE_TYPE_LABELS } from "@shared/collection-daily-status";

function buildCalendarDate(year: number, month: number, day: number) {
  const safeMonth = Math.max(1, Math.min(12, month));
  const safeDay = Math.max(1, Math.min(31, day));
  return `${year}-${String(safeMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

export function describeCollectionDailyEditableDayStatus(day: EditableCalendarDay) {
  if (day.status === "WORKING") {
    return "Working";
  }

  const leaveLabel = day.leaveType
    ? `${day.leaveType} - ${COLLECTION_DAILY_LEAVE_TYPE_LABELS[day.leaveType]}`
    : "Holiday / Leave";
  const note = day.note.trim();

  return note ? `${leaveLabel}. Remark: ${note}` : leaveLabel;
}

export function buildCollectionDailyCalendarSavedDescription(input: {
  username: string;
  year: number;
  month: number;
  days: EditableCalendarDay[];
}) {
  const staffLabel = input.username.trim() || "selected staff";

  if (input.days.length === 1) {
    const day = input.days[0];
    if (!day) {
      return `Daily status for ${staffLabel} has been updated.`;
    }

    const formattedDate = formatDateDDMMYYYY(buildCalendarDate(input.year, input.month, day.day));
    const statusSummary = describeCollectionDailyEditableDayStatus(day);
    return `Status ${staffLabel} pada ${formattedDate} ditetapkan kepada ${statusSummary}.`;
  }

  return `${input.days.length} changed days saved for ${staffLabel}.`;
}
