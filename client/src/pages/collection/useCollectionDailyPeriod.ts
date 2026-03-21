import { useEffect, useState } from "react";

export const MIN_COLLECTION_DAILY_YEAR = 2000;
export const MAX_COLLECTION_DAILY_YEAR = 2100;

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
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [yearInput, setYearInput] = useState(String(now.getFullYear()));
  const [monthInput, setMonthInput] = useState(String(now.getMonth() + 1));

  useEffect(() => {
    setYearInput(String(year));
  }, [year]);

  useEffect(() => {
    setMonthInput(String(month));
  }, [month]);

  const commitYearInput = () => {
    const nextYear = normalizeCollectionDailyYearInput(yearInput, year);
    setYear(nextYear);
    setYearInput(String(nextYear));
    return nextYear;
  };

  const commitMonthInput = () => {
    const nextMonth = normalizeCollectionDailyMonthInput(monthInput, month);
    setMonth(nextMonth);
    setMonthInput(String(nextMonth));
    return nextMonth;
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
  };
}
