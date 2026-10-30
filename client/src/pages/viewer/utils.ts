import { buildCsvContent, downloadCsv } from "@/lib/csv";
import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";
import {
  isDateImportFilterOperator, isNumericImportFilterOperator,
  matchesImportDateFilter, matchesImportNumericFilter,
} from "@shared/common/import-data-filters";

export function extractHeadersFromRows(rows: DataRowWithId[]) {
  const headerSet = new Set<string>();

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key !== "__rowId") {
        headerSet.add(key);
      }
    });
  });

  return Array.from(headerSet);
}

export function filterViewerRows(rows: DataRowWithId[], columnFilters: ColumnFilter[]) {
  if (rows.length === 0 || columnFilters.length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    columnFilters.every((filter) => {
      if (isNumericImportFilterOperator(filter.operator)) {
        return matchesImportNumericFilter(row[filter.column], filter);
      }
      if (isDateImportFilterOperator(filter.operator)) {
        return matchesImportDateFilter(row[filter.column], filter);
      }
      const cellValue = String(row[filter.column] ?? "").toLowerCase();
      const filterValue = filter.value.toLowerCase();

      switch (filter.operator) {
        case "contains":
          return cellValue.includes(filterValue);
        case "equals":
          return cellValue === filterValue;
        case "startsWith":
          return cellValue.startsWith(filterValue);
        case "endsWith":
          return cellValue.endsWith(filterValue);
        case "notEquals":
          return cellValue !== filterValue;
        default:
          return true;
      }
    }),
  );
}

/** Typed date/number page membership is authoritative on PostgreSQL. */
export function filterViewerServerPageRows(rows: DataRowWithId[], columnFilters: ColumnFilter[]) {
  // A JSON number above MAX_SAFE_INTEGER can be rounded during JSON parsing.
  // Reapplying numeric predicates here would remove matching server records.
  // Calendar-date membership is likewise resolved before server pagination.
  return filterViewerRows(rows, columnFilters.filter(filter => !isNumericImportFilterOperator(filter.operator)
    && !isDateImportFilterOperator(filter.operator)));
}

export function downloadViewerRowsAsCsv(headers: string[], rows: DataRowWithId[], filename: string) {
  const csvContent = buildCsvContent(
    headers,
    rows.map((row) => headers.map((header) => row[header] ?? "")),
  );
  downloadCsv(csvContent, filename);
}
