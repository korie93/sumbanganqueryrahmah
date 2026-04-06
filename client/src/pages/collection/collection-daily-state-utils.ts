import type { CollectionDailyOverviewResponse } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

export const COLLECTION_DAILY_DAY_DETAILS_PAGE_SIZE = 10;

export function shouldLoadCollectionDailyOverview(options: {
  canManage: boolean;
  currentUsername: string;
  selectedUsernames: string[];
}) {
  const { canManage, currentUsername, selectedUsernames } = options;
  if (canManage && selectedUsernames.length === 0) return false;
  if (!canManage && !currentUsername) return false;
  return true;
}

export function getCollectionDailyEmptyOverviewMessage(options: {
  canManage: boolean;
  currentUsername: string;
  selectedUsernames: string[];
}) {
  const { canManage, currentUsername, selectedUsernames } = options;
  if (canManage && selectedUsernames.length === 0) {
    return "Select at least one staff nickname to view Collection Daily.";
  }
  if (!canManage && !currentUsername) {
    return "Current staff nickname session could not be resolved.";
  }
  return "No overview data found.";
}

export function mapCollectionDailyEditableCalendarDays(
  response: CollectionDailyOverviewResponse,
): EditableCalendarDay[] {
  return response.days.map((day) => ({
    day: day.day,
    isWorkingDay: day.isWorkingDay,
    isHoliday: day.isHoliday,
    holidayName: day.holidayName || "",
  }));
}

export function buildCollectionDailyCalendarPayloadDays(calendarDays: EditableCalendarDay[]) {
  return calendarDays.map((day) => ({
    day: day.day,
    isWorkingDay: day.isWorkingDay,
    isHoliday: day.isHoliday,
    holidayName: day.holidayName || null,
  }));
}

export function updateCollectionDailyEditableCalendarDay(
  previous: EditableCalendarDay[],
  dayNumber: number,
  patch: Partial<EditableCalendarDay>,
) {
  return previous.map((item) => (item.day === dayNumber ? { ...item, ...patch } : item));
}

export function getCollectionDailyFirstWeekday(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}
