import { formatCollectionMonthName, parseCollectionMonthKey } from "./collection-monthly-format-utils";
import type { CollectionSameDayPaceCalendarStatus, CollectionSameDayPaceDailyInput } from "./collection-monthly-same-day-types";

export function formatCollectionSameDayPaceDate(monthKey: string, day: number): string {
  const parsed = parseCollectionMonthKey(monthKey);
  if (!parsed) {
    return "";
  }
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatCollectionSameDayPaceRangeLabel(monthKey: string, startDay: number, endDay: number): string {
  const parsed = parseCollectionMonthKey(monthKey);
  if (!parsed) {
    return monthKey;
  }
  const monthName = formatCollectionMonthName(parsed.month);
  if (startDay === endDay) {
    return `${monthName} ${startDay}, ${parsed.year}`;
  }
  return `${monthName} ${startDay} to ${monthName} ${endDay}, ${parsed.year}`;
}

export function formatCollectionSameDayPacePercent(value: number | null): string {
  if (value === null) {
    return "no baseline";
  }
  return `${Math.abs(value).toFixed(1)}%`;
}

function normalizeCollectionSameDayHolidayName(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function buildCollectionSameDayPaceCalendarStatus(
  day: CollectionSameDayPaceDailyInput | null | undefined,
): CollectionSameDayPaceCalendarStatus {
  if (!day) {
    return {
      label: "Calendar not configured",
      description: "No working-day or holiday status is available for this date.",
      isWorkingDay: null,
      isHoliday: false,
      holidayName: null,
      tone: "unknown",
    };
  }

  const holidayName = normalizeCollectionSameDayHolidayName(day.holidayName);
  const hasWorkingDaySignal = typeof day.isWorkingDay === "boolean";
  const hasHolidaySignal = typeof day.isHoliday === "boolean";
  if (!hasWorkingDaySignal && !hasHolidaySignal) {
    return {
      label: "Calendar not configured",
      description: "No working-day or holiday status is available for this date.",
      isWorkingDay: null,
      isHoliday: false,
      holidayName,
      tone: "unknown",
    };
  }

  const isHoliday = day.isHoliday === true;
  const isWorkingDay = day.isWorkingDay === true && !isHoliday;
  if (!isWorkingDay || isHoliday) {
    const label = holidayName ? `Holiday / non-working (${holidayName})` : "Holiday / non-working";
    return {
      label,
      description: holidayName
        ? `${holidayName} is marked as a holiday or non-working day.`
        : "This date is marked as a holiday or non-working day.",
      isWorkingDay: false,
      isHoliday,
      holidayName,
      tone: "non_working",
    };
  }

  return {
    label: "Working day",
    description: "This date is marked as an active working day.",
    isWorkingDay: true,
    isHoliday: false,
    holidayName,
    tone: "working",
  };
}