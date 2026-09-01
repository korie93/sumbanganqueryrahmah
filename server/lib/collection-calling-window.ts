const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const COMPACT_DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;
const DAY_FIRST_DATE_PATTERN = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/;
const EXCEL_SERIAL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MILLISECONDS_PER_DAY = 86_400_000;

function formatDateOnly(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseExcelSerialDate(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const serialDay = Math.trunc(value);
  if (serialDay <= 0 || serialDay > 2_958_465) return null;
  const candidate = new Date(EXCEL_SERIAL_EPOCH_UTC + serialDay * MILLISECONDS_PER_DAY);
  return formatDateOnly(
    candidate.getUTCFullYear(),
    candidate.getUTCMonth() + 1,
    candidate.getUTCDate(),
  );
}

export function parseSavedCallingDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return formatDateOnly(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    return parseExcelSerialDate(value);
  }

  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const isoPrefix = normalized.match(DATE_ONLY_PATTERN)
    ?? normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (isoPrefix) {
    return formatDateOnly(Number(isoPrefix[1]), Number(isoPrefix[2]), Number(isoPrefix[3]));
  }

  const compact = normalized.match(COMPACT_DATE_PATTERN);
  if (compact) {
    return formatDateOnly(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  }

  const dayFirst = normalized.match(DAY_FIRST_DATE_PATTERN);
  if (dayFirst) {
    return formatDateOnly(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
  }

  if (/^\d{1,7}(?:\.\d+)?$/.test(normalized)) {
    return parseExcelSerialDate(Number(normalized));
  }

  return null;
}

function parseDateParts(value: string): { year: number; month: number; day: number } | null {
  const parsed = value.match(DATE_ONLY_PATTERN);
  if (!parsed) return null;
  const year = Number(parsed[1]);
  const month = Number(parsed[2]);
  const day = Number(parsed[3]);
  return formatDateOnly(year, month, day) ? { year, month, day } : null;
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addOneCalendarMonthDateOnly(value: string): string | null {
  const parts = parseDateParts(value);
  if (!parts) return null;

  const nextMonthIndex = parts.month;
  const nextYear = parts.year + Math.floor(nextMonthIndex / 12);
  const nextMonth = (nextMonthIndex % 12) + 1;
  const nextDay = Math.min(parts.day, daysInUtcMonth(nextYear, nextMonth));
  return formatDateOnly(nextYear, nextMonth, nextDay);
}

export function subtractOneDayDateOnly(value: string): string | null {
  const parts = parseDateParts(value);
  if (!parts) return null;
  const candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - MILLISECONDS_PER_DAY);
  return formatDateOnly(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, candidate.getUTCDate());
}

export type CollectionCallingWindow = {
  start: string;
  endInclusive: string;
  endExclusive: string;
};

export function buildCollectionCallingWindow(callingDate: string): CollectionCallingWindow | null {
  const start = parseSavedCallingDate(callingDate);
  if (!start) return null;
  const endExclusive = addOneCalendarMonthDateOnly(start);
  const endInclusive = endExclusive ? subtractOneDayDateOnly(endExclusive) : null;
  if (!endExclusive || !endInclusive) return null;
  return { start, endInclusive, endExclusive };
}

export function isDateInsideCollectionCallingWindow(
  paymentDate: string,
  window: Pick<CollectionCallingWindow, "start" | "endExclusive">,
): boolean {
  const normalizedPaymentDate = parseSavedCallingDate(paymentDate);
  return Boolean(
    normalizedPaymentDate
    && normalizedPaymentDate >= window.start
    && normalizedPaymentDate < window.endExclusive,
  );
}
