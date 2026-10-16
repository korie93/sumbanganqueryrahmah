import { useEffect, useState } from "react";

export const MIN_COLLECTION_DAILY_YEAR = 2000;
export const MAX_COLLECTION_DAILY_YEAR = 2100;

type CollectionDailyPeriod = { year: number; month: number };

const malaysiaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar navigation follows the business timezone, not the browser's timezone. */
export function getCollectionDailyTodayDate(now: Date) {
  const parts = malaysiaDateFormatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getCollectionDailyMalaysiaPeriod(now: Date): CollectionDailyPeriod {
  const [year, month] = getCollectionDailyTodayDate(now).split("-").map(Number);
  return { year, month };
}

export function shiftCollectionDailyPeriod(
  period: CollectionDailyPeriod,
  direction: -1 | 1,
): CollectionDailyPeriod {
  const monthIndex = clampNumber(
    period.year * 12 + period.month - 1 + direction,
    MIN_COLLECTION_DAILY_YEAR * 12,
    MAX_COLLECTION_DAILY_YEAR * 12 + 11,
  );
  return { year: Math.floor(monthIndex / 12), month: monthIndex % 12 + 1 };
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseIntegerInput(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeCollectionDailyYearInput(value: string, fallbackYear: number) {
  const parsed = parseIntegerInput(value);
  return parsed == null
    ? fallbackYear
    : clampNumber(parsed, MIN_COLLECTION_DAILY_YEAR, MAX_COLLECTION_DAILY_YEAR);
}

export function normalizeCollectionDailyMonthInput(value: string, fallbackMonth: number) {
  const parsed = parseIntegerInput(value);
  return parsed == null ? fallbackMonth : clampNumber(parsed, 1, 12);
}

export function useCollectionDailyPeriod(now: Date) {
  const currentPeriod = getCollectionDailyMalaysiaPeriod(now);
  const [{ year, month }, setPeriod] = useState<CollectionDailyPeriod>(() => ({
    ...currentPeriod,
    year: clampNumber(currentPeriod.year, MIN_COLLECTION_DAILY_YEAR, MAX_COLLECTION_DAILY_YEAR),
  }));
  const [yearInput, setYearInput] = useState(String(year));
  const [monthInput, setMonthInput] = useState(String(month));

  useEffect(() => {
    setYearInput(String(year));
  }, [year]);

  useEffect(() => {
    setMonthInput(String(month));
  }, [month]);

  const commitYearInput = () => {
    const nextYear = normalizeCollectionDailyYearInput(yearInput, year);
    setPeriod((previous) => ({ ...previous, year: nextYear }));
    setYearInput(String(nextYear));
    return nextYear;
  };

  const commitMonthInput = () => {
    const nextMonth = normalizeCollectionDailyMonthInput(monthInput, month);
    setPeriod((previous) => ({ ...previous, month: nextMonth }));
    setMonthInput(String(nextMonth));
    return nextMonth;
  };

  const goToPreviousMonth = () => setPeriod((previous) => shiftCollectionDailyPeriod(previous, -1));
  const goToNextMonth = () => setPeriod((previous) => shiftCollectionDailyPeriod(previous, 1));
  const goToCurrentMonth = (nowOverride: Date = now) => {
    const current = getCollectionDailyMalaysiaPeriod(nowOverride);
    setPeriod({
      ...current,
      year: clampNumber(current.year, MIN_COLLECTION_DAILY_YEAR, MAX_COLLECTION_DAILY_YEAR),
    });
  };

  return {
    year,
    month,
    yearInput,
    monthInput,
    setYearInput,
    setMonthInput,
    commitYearInput,
    commitMonthInput,
    goToPreviousMonth,
    goToNextMonth,
    goToCurrentMonth,
    canPreviousMonth: year > MIN_COLLECTION_DAILY_YEAR || month > 1,
    canNextMonth: year < MAX_COLLECTION_DAILY_YEAR || month < 12,
    isCurrentMonth: year === currentPeriod.year && month === currentPeriod.month,
  };
}
