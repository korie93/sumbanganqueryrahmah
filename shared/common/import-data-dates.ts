import type { ImportDataColumnFilter } from "./import-data-filters";

export type DateImportFilterOperator = "dateBefore" | "dateAfter" | "dateBetween";
export const IMPORT_FILTER_DATE_MAX_LENGTH = 32;
export const IMPORT_FILTER_ISO_DATE_PATTERN = "^([0-9]{4})-([0-9]{2})-([0-9]{2})$";
export const IMPORT_FILTER_COMPACT_DATE_PATTERN = "^([0-9]{4})([0-9]{2})([0-9]{2})$";
export const IMPORT_FILTER_DAY_FIRST_DATE_PATTERN = "^([0-9]{1,2})([/\u002d])([0-9]{1,2})\\2([0-9]{4})$";

export function isDateImportFilterOperator(operator: unknown): operator is DateImportFilterOperator {
  return operator === "dateBefore" || operator === "dateAfter" || operator === "dateBetween";
}

function dateFromParts(year: number, month: number, day: number): string | null {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= days
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
}

/** A calendar day only: no timezone, rollover, locale guessing or Excel serials. */
export function normalizeImportFilterDate(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  if (typeof raw === "number" && (!Number.isSafeInteger(raw) || raw < 10_000_000 || raw > 99_999_999)) return null;
  const text = String(raw).replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  if (text.length > IMPORT_FILTER_DATE_MAX_LENGTH) return null;
  const iso = new RegExp(IMPORT_FILTER_ISO_DATE_PATTERN).exec(text)
    ?? new RegExp(IMPORT_FILTER_COMPACT_DATE_PATTERN).exec(text);
  if (iso) return dateFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dayFirst = new RegExp(IMPORT_FILTER_DAY_FIRST_DATE_PATTERN).exec(text);
  return dayFirst ? dateFromParts(Number(dayFirst[4]), Number(dayFirst[3]), Number(dayFirst[1])) : null;
}

/** UI/API bounds must use one canonical representation, including a four-digit year. */
export function normalizeImportFilterDateBound(raw: unknown): string | null {
  return typeof raw === "string" && raw.length === 10 && new RegExp(IMPORT_FILTER_ISO_DATE_PATTERN).test(raw)
    ? normalizeImportFilterDate(raw) : null;
}

export function getImportDateFilterValidationIssue(filter: ImportDataColumnFilter): string | null {
  if (!isDateImportFilterOperator(filter.operator)) return null;
  if (filter.operator === "dateBetween" && (!filter.value || !filter.valueTo)) return "Enter both a start and end date.";
  const start = normalizeImportFilterDateBound(filter.value);
  const end = filter.operator === "dateBetween" ? normalizeImportFilterDateBound(filter.valueTo) : null;
  if (start === null || (filter.operator === "dateBetween" && end === null)) return "Enter a valid date (YYYY-MM-DD).";
  return end !== null && start > end ? "Start date must be on or before end date." : null;
}

export function matchesImportDateFilter(raw: unknown, filter: ImportDataColumnFilter): boolean {
  if (!isDateImportFilterOperator(filter.operator) || getImportDateFilterValidationIssue(filter) !== null) return false;
  const date = normalizeImportFilterDate(raw);
  if (date === null) return false;
  if (filter.operator === "dateBefore") return date < filter.value;
  if (filter.operator === "dateAfter") return date > filter.value;
  return date >= filter.value && date <= (filter.valueTo ?? "");
}
