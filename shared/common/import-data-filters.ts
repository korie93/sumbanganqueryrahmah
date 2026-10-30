import { getImportDateFilterValidationIssue, isDateImportFilterOperator } from "./import-data-dates";
export { isDateImportFilterOperator, matchesImportDateFilter } from "./import-data-dates";
export type { DateImportFilterOperator } from "./import-data-dates";

/** Browser/server contract for Viewer filters over imported JSON values. */
export const IMPORT_DATA_FILTER_OPERATORS = [
  "contains", "equals", "startsWith", "endsWith", "notEquals",
  "greaterThan", "lessThan", "between",
  "dateBefore", "dateAfter", "dateBetween",
] as const;

export type ImportDataFilterOperator = typeof IMPORT_DATA_FILTER_OPERATORS[number];
export type NumericImportFilterOperator = "greaterThan" | "lessThan" | "between";

export interface ImportDataColumnFilter {
  column: string;
  operator: ImportDataFilterOperator;
  value: string;
  valueTo?: string | undefined;
}

export const IMPORT_FILTER_NUMBER_MAX_LENGTH = 256;
// ASCII syntax shared with PostgreSQL. Commas must form complete thousands groups.
export const IMPORT_FILTER_NUMBER_PATTERN = "^[+-]?(([0-9]+|[0-9]{1,3}(,[0-9]{3})+)(\\.[0-9]*)?|\\.[0-9]+)$";
const numberPattern = new RegExp(IMPORT_FILTER_NUMBER_PATTERN);

export function isNumericImportFilterOperator(operator: unknown): operator is NumericImportFilterOperator {
  return operator === "greaterThan" || operator === "lessThan" || operator === "between";
}

export function isImportFilterRangeOperator(operator: unknown): boolean {
  return operator === "between" || operator === "dateBetween";
}

/** Returns an exact decimal string; never rounds imported identifiers or money. */
export function normalizeImportFilterNumber(raw: unknown): string | null {
  return normalizeNumber(raw, IMPORT_FILTER_NUMBER_MAX_LENGTH);
}

function normalizeNumber(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  if (typeof raw === "number" && !Number.isFinite(raw)) return null;
  // JSONB expands JSON numeric exponents. Match that representation for native
  // JSON numbers; a user-supplied string such as "1e3" still remains invalid.
  let representation = String(raw);
  if (typeof raw === "number" && /e/i.test(representation)) {
    const [mantissa = "", exponent = "0"] = representation.toLowerCase().split("e");
    const negative = mantissa.startsWith("-");
    const unsigned = negative ? mantissa.slice(1) : mantissa;
    const [whole = "", fraction = ""] = unsigned.split(".");
    const digits = whole + fraction;
    const decimalPosition = whole.length + Number(exponent);
    representation = (negative ? "-" : "") + (decimalPosition <= 0
      ? `0.${"0".repeat(-decimalPosition)}${digits}`
      : decimalPosition >= digits.length
        ? `${digits}${"0".repeat(decimalPosition - digits.length)}`
        : `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`);
  }
  const text = representation.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  if (!text || text.length > maxLength || !numberPattern.test(text)) return null;
  const negative = text.startsWith("-");
  const unsigned = text.replace(/^[+-]/, "").replace(/,/g, "");
  const [whole = "", fraction = ""] = unsigned.split(".");
  const integer = whole.replace(/^0+/, "") || "0";
  const decimal = fraction.replace(/0+$/, "");
  const sign = negative && (integer !== "0" || decimal !== "") ? "-" : "";
  return `${sign}${integer}${decimal ? `.${decimal}` : ""}`;
}

/** Exact bounded comparison, including numbers outside JavaScript's safe integer range. */
export function compareImportFilterNumbers(left: string, right: string): -1 | 0 | 1 | null {
  // A normalized leading-dot value gains a zero; validation still bounds raw input.
  const a = normalizeNumber(left, IMPORT_FILTER_NUMBER_MAX_LENGTH + 2);
  const b = normalizeNumber(right, IMPORT_FILTER_NUMBER_MAX_LENGTH + 2);
  if (a === null || b === null) return null;
  if (a === b) return 0;
  const negativeA = a.startsWith("-");
  const negativeB = b.startsWith("-");
  if (negativeA !== negativeB) return negativeA ? -1 : 1;
  const [wholeA = "0", fractionA = ""] = (negativeA ? a.slice(1) : a).split(".");
  const [wholeB = "0", fractionB = ""] = (negativeB ? b.slice(1) : b).split(".");
  const scale = Math.max(fractionA.length, fractionB.length);
  const magnitude = wholeA.length !== wholeB.length
    ? (wholeA.length < wholeB.length ? -1 : 1)
    : wholeA !== wholeB
      ? (wholeA < wholeB ? -1 : 1)
      : fractionA.padEnd(scale, "0") < fractionB.padEnd(scale, "0") ? -1 : 1;
  return negativeA ? (magnitude === -1 ? 1 : -1) : magnitude;
}

/** Numeric drafts are inactive until every required bound is valid. */
export function getImportFilterValidationIssue(filter: ImportDataColumnFilter): string | null {
  if (isDateImportFilterOperator(filter.operator)) return getImportDateFilterValidationIssue(filter);
  if (!isNumericImportFilterOperator(filter.operator)) return null;
  if (filter.operator === "between" && (!filter.value.trim() || !filter.valueTo?.trim())) {
    return "Enter both a minimum and maximum.";
  }
  const minimum = normalizeImportFilterNumber(filter.value);
  const maximum = filter.operator === "between" ? normalizeImportFilterNumber(filter.valueTo) : null;
  if (minimum === null || (filter.operator === "between" && maximum === null)) {
    return "Enter a valid number (for example, 1,000.50).";
  }
  if (maximum !== null && compareImportFilterNumbers(minimum, maximum) === 1) {
    return "Minimum must be less than or equal to maximum.";
  }
  return null;
}

export function isImportDataFilterActive(filter: ImportDataColumnFilter): boolean {
  return filter.column.trim() !== "" && filter.value.trim() !== ""
    && getImportFilterValidationIssue(filter) === null;
}

/** Client fallback uses the same decimal semantics as the guarded SQL predicate. */
export function matchesImportNumericFilter(raw: unknown, filter: ImportDataColumnFilter): boolean {
  if (!isNumericImportFilterOperator(filter.operator) || getImportFilterValidationIssue(filter) !== null) return false;
  const number = normalizeImportFilterNumber(raw);
  if (number === null) return false;
  const lowerComparison = compareImportFilterNumbers(number, filter.value);
  if (lowerComparison === null) return false;
  if (filter.operator === "greaterThan") return lowerComparison === 1;
  if (filter.operator === "lessThan") return lowerComparison === -1;
  const upperComparison = compareImportFilterNumbers(number, filter.valueTo ?? "");
  return lowerComparison >= 0 && upperComparison !== null && upperComparison <= 0;
}
