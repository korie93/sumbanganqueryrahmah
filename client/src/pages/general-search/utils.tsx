import { downloadBlob } from "@/lib/download";
import type { FilterRow, SearchOperatorOption, SearchResultRow } from "@/pages/general-search/types";

export const OPERATORS: SearchOperatorOption[] = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Not equals" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "greaterThan", label: "Greater than" },
  { value: "lessThan", label: "Less than" },
  { value: "greaterThanOrEqual", label: "Greater than or equal" },
  { value: "lessThanOrEqual", label: "Less than or equal" },
  { value: "isEmpty", label: "Is empty" },
  { value: "isNotEmpty", label: "Is not empty" },
];

export function createEmptyFilterRow(id = "1"): FilterRow {
  return { id, field: "", operator: "contains", value: "" };
}

export function getActiveFiltersCount(filters: FilterRow[]) {
  return filters.filter(
    (filter) => filter.field && (filter.operator === "isEmpty" || filter.operator === "isNotEmpty" || filter.value.trim()),
  ).length;
}

export function getSearchOperatorLabel(operator: string) {
  return OPERATORS.find((option) => option.value === operator)?.label ?? operator;
}

export function buildSearchFilterSummaries(filters: FilterRow[]) {
  return filters
    .filter(
      (filter) =>
        filter.field &&
        (filter.operator === "isEmpty" ||
          filter.operator === "isNotEmpty" ||
          filter.value.trim()),
    )
    .map((filter) => {
      const normalizedValue = filter.value.trim().replace(/\s+/g, " ");
      const compactValue =
        normalizedValue.length > 28
          ? `${normalizedValue.slice(0, 25).trimEnd()}...`
          : normalizedValue;

      if (filter.operator === "isEmpty" || filter.operator === "isNotEmpty") {
        return `${filter.field} • ${getSearchOperatorLabel(filter.operator)}`;
      }

      return `${filter.field} • ${getSearchOperatorLabel(filter.operator)} • ${compactValue}`;
    });
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getPriorityRank(key: string): number {
  const normalizedKey = normalizeKey(key);
  if (/(ic|mykad|nric|no?kp|kadpengenalan)/.test(normalizedKey)) return 0;
  if (/(fullname|namapenuh|nama)/.test(normalizedKey)) return 1;
  if (/(account|akaun|acct|accno|accountno)/.test(normalizedKey)) return 2;
  if (/(card|kad|cardno)/.test(normalizedKey)) return 3;
  if (/(address|alamat|addr|residential|homeaddress|officeaddress)/.test(normalizedKey)) return 4;
  if (/(phone|telefon|tel|hp|handphone|mobile)/.test(normalizedKey)) return 5;
  if (/(age|umur)/.test(normalizedKey)) return 6;
  return 999;
}

export function getCellDisplayText(rawValue: unknown) {
  if (typeof rawValue === "string") return rawValue;
  if (rawValue === null || rawValue === undefined) return "-";
  if (Array.isArray(rawValue)) return rawValue.join(", ");
  if (typeof rawValue === "object") return JSON.stringify(rawValue);
  return String(rawValue);
}

export function orderSearchHeaders(allHeaders: string[], canSeeSourceFile: boolean) {
  const headers = [...allHeaders];
  const sourceIndex = headers.indexOf("Source File");
  if (sourceIndex >= 0) {
    headers.splice(sourceIndex, 1);
  }

  headers.sort((left, right) => {
    const leftRank = getPriorityRank(left);
    const rightRank = getPriorityRank(right);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });

  if (canSeeSourceFile) {
    headers.push("Source File");
  }

  return headers;
}

export function collectSearchHeaders(rows: SearchResultRow[], canSeeSourceFile: boolean) {
  const allHeaders = Array.from(
    new Set(
      rows.flatMap((row) => Object.keys(row).filter((key) => !key.startsWith("_"))),
    ),
  ).sort();

  const filteredHeaders = canSeeSourceFile
    ? allHeaders
    : allHeaders.filter((header) => header !== "Source File");

  return orderSearchHeaders(filteredHeaders, canSeeSourceFile);
}

export function downloadSearchResultsAsCsv(headers: string[], rows: SearchResultRow[], filename: string) {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => `"${getCellDisplayText(row[header]).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}

export function highlightMatch(text: string, query: string): JSX.Element {
  if (!query) return <>{text}</>;

  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  let cursor = 0;

  return (
    <>
      {parts.map((part) => {
        const key = `${cursor}:${part}`;
        cursor += part.length;
        return part.toLowerCase() === query.toLowerCase() ? (
          <mark key={key} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        );
      })}
    </>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
