import { downloadBlob } from "@/lib/download";

export const CSV_UTF8_BOM = "\uFEFF";
export const CSV_MIME_TYPE = "text/csv;charset=utf-8;";

type CsvCellValue = unknown;

type CsvFormatOptions = {
  delimiter?: string;
  emptyValue?: string;
  quoteAll?: boolean;
};

type CsvBlobOptions = {
  withBom?: boolean;
};

const CSV_FORMULA_INJECTION_PATTERN = /^(?:[\t\r\n]|\s*[=+\-@])/u;
const CSV_SAFE_NUMERIC_LITERAL_PATTERN = /^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)$/u;

function stringifyCsvObject(value: object) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeCsvCellValue(value: CsvCellValue, emptyValue = ""): string {
  if (value === null || value === undefined) {
    return emptyValue;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : emptyValue;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : emptyValue;
  }

  if (typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    return stringifyCsvObject(value);
  }

  if (value === "null" || value === "undefined") {
    return emptyValue;
  }

  return String(value);
}

export function neutralizeCsvFormulaInjection(value: string): string {
  if (CSV_SAFE_NUMERIC_LITERAL_PATTERN.test(value)) {
    return value;
  }

  return CSV_FORMULA_INJECTION_PATTERN.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: CsvCellValue, options: CsvFormatOptions = {}): string {
  const delimiter = options.delimiter ?? ",";
  const quoteAll = options.quoteAll ?? true;
  const normalizedText = normalizeCsvCellValue(value, options.emptyValue ?? "");
  const text = typeof value === "number" || typeof value === "bigint"
    ? normalizedText
    : neutralizeCsvFormulaInjection(normalizedText);
  const mustQuote =
    quoteAll ||
    text.includes(delimiter) ||
    text.includes("\"") ||
    text.includes("\n") ||
    text.includes("\r");

  return mustQuote ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsvContent(
  headers: readonly CsvCellValue[],
  rows: readonly (readonly CsvCellValue[])[],
  options: CsvFormatOptions = {},
) {
  const delimiter = options.delimiter ?? ",";
  return [
    headers.map((header) => escapeCsvCell(header, options)).join(delimiter),
    ...rows.map((row) => row.map((cell) => escapeCsvCell(cell, options)).join(delimiter)),
  ].join("\r\n");
}

export function createCsvBlob(csvContent: string, options: CsvBlobOptions = {}) {
  const withBom = options.withBom ?? true;
  return new Blob([withBom ? CSV_UTF8_BOM : "", csvContent], {
    type: CSV_MIME_TYPE,
  });
}

export function downloadCsv(csvContent: string, filename: string, options: CsvBlobOptions = {}) {
  downloadBlob(createCsvBlob(csvContent, options), filename);
}
