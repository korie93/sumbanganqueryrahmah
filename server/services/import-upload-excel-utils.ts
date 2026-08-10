import {
  createUploadFileTooLargeError,
  validateUploadFileSize,
} from "./import-upload-file-utils";
import {
  preflightSpreadsheetArchive,
  type SpreadsheetArchivePreflightOptions,
} from "./import-upload-archive-preflight";
import { parseExcelFileInWorker } from "./import-upload-excel-worker-runner";
import { getImportUploadSpreadsheetRuntime } from "./import-upload-xlsx-runtime";
import type { ImportRow, ParsedImportUploadResult } from "./import-upload-types";
import {
  findSpreadsheetHeaderRowIndex,
  normalizeSpreadsheetIdentifierCells,
} from "../../shared/common/spreadsheet-identifier-normalization";

export type ParseExcelOptions = SpreadsheetArchivePreflightOptions & {
  maxRows?: number;
  maxBytes?: number;
  maxColumns?: number;
  maxSheets?: number;
  maxCellLength?: number;
};

const DEFAULT_IMPORT_MAX_COLUMNS = 300;
const DEFAULT_IMPORT_MAX_SHEETS = 20;
const DEFAULT_IMPORT_MAX_CELL_LENGTH = 5_000;

function mapExcelReadError(error: unknown): ParsedImportUploadResult {
  const message = error instanceof Error ? error.message : "Failed to read Excel file";
  if (message.includes("password") || message.includes("encrypt")) {
    return { headers: [], rows: [], error: "File is password protected" };
  }
  if (message.includes("Unsupported") || message.includes("corrupt")) {
    return { headers: [], rows: [], error: "File is corrupted or unsupported format" };
  }
  return {
    headers: [],
    rows: [],
    error: "The spreadsheet could not be parsed. Verify that it is a valid XLSX or XLSB file.",
  };
}

function resolveExcelMaxRows(options?: ParseExcelOptions) {
  const value = options?.maxRows;
  if (value == null || !Number.isFinite(value)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(1, Math.trunc(value));
}

function createSpreadsheetRowLimitError(maxRows: number): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: `Spreadsheet import exceeds the configured row limit of ${maxRows.toLocaleString("en-US")} rows. Split the file into smaller uploads.`,
  };
}

function resolvePositiveLimit(value: number | undefined, fallback: number) {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(value));
}

function createSpreadsheetStructureError(message: string): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: message,
  };
}

function parseWorkbookJsonData(jsonData: unknown[][], options?: ParseExcelOptions): ParsedImportUploadResult {
  if (jsonData.length === 0) {
    return { headers: [], rows: [], error: "Excel file is empty." };
  }

  const maxColumns = resolvePositiveLimit(options?.maxColumns, DEFAULT_IMPORT_MAX_COLUMNS);
  const maxCellLength = resolvePositiveLimit(options?.maxCellLength, DEFAULT_IMPORT_MAX_CELL_LENGTH);
  for (const row of jsonData) {
    if (row.length > maxColumns) {
      return createSpreadsheetStructureError(
        `Spreadsheet import exceeds the configured column limit of ${maxColumns.toLocaleString("en-US")} columns.`,
      );
    }
    if (row.some((cell) => String(cell ?? "").length > maxCellLength)) {
      return createSpreadsheetStructureError(
        `Spreadsheet import contains a cell longer than the configured ${maxCellLength.toLocaleString("en-US")} character limit.`,
      );
    }
  }

  const headerRowIndex = findSpreadsheetHeaderRowIndex(jsonData);

  const headers = jsonData[headerRowIndex].map((header, index) => {
    const value = String(header || "").trim();
    return value || `Column_${index + 1}`;
  });

  const rows: ImportRow[] = [];
  const maxRows = resolveExcelMaxRows(options);

  for (let rowIndex = headerRowIndex + 1; rowIndex < jsonData.length; rowIndex += 1) {
    const rowData = jsonData[rowIndex];
    const hasAnyData = rowData.some((cell, index) => {
      if (index >= headers.length) return false;
      return String(cell ?? "").trim() !== "";
    });

    if (!hasAnyData) continue;
    if (rows.length >= maxRows) {
      return createSpreadsheetRowLimitError(maxRows);
    }

    const row: ImportRow = {};
    headers.forEach((header, index) => {
      const cellValue = rowData[index];
      row[header] =
        cellValue instanceof Date
          ? cellValue.toLocaleDateString("en-MY")
          : String(cellValue ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

export function parseExcelBuffer(buffer: Buffer, options?: ParseExcelOptions): ParsedImportUploadResult {
  if (Number.isFinite(options?.maxBytes) && (options?.maxBytes as number) > 0 && buffer.length > (options?.maxBytes as number)) {
    return createUploadFileTooLargeError(options?.maxBytes);
  }

  const archivePreflight = preflightSpreadsheetArchive(buffer, options);
  if (!archivePreflight.success) {
    return {
      headers: [],
      rows: [],
      error: archivePreflight.error,
    };
  }

  let workbook;
  const spreadsheetRuntime = getImportUploadSpreadsheetRuntime();
  try {
    workbook = spreadsheetRuntime.readWorkbook(buffer, {
      type: "buffer",
      cellDates: true,
      cellFormula: false,
      cellNF: false,
      cellText: true,
    });
  } catch (error: unknown) {
    return mapExcelReadError(error);
  }

  try {
    const maxSheets = resolvePositiveLimit(options?.maxSheets, DEFAULT_IMPORT_MAX_SHEETS);
    if (workbook.SheetNames.length > maxSheets) {
      return createSpreadsheetStructureError(
        `Spreadsheet import exceeds the configured sheet limit of ${maxSheets.toLocaleString("en-US")} sheets.`,
      );
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { headers: [], rows: [], error: "Excel file does not have any sheets." };
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const worksheetRef = worksheet?.["!ref"];
    if (worksheetRef) {
      const range = spreadsheetRuntime.decodeRange(worksheetRef);
      const declaredColumns = Math.max(0, range.e.c - range.s.c + 1);
      const maxColumns = resolvePositiveLimit(options?.maxColumns, DEFAULT_IMPORT_MAX_COLUMNS);
      if (declaredColumns > maxColumns) {
        return createSpreadsheetStructureError(
          `Spreadsheet import exceeds the configured column limit of ${maxColumns.toLocaleString("en-US")} columns.`,
        );
      }

      const declaredRows = Math.max(0, range.e.r - range.s.r);
      const maxRows = resolveExcelMaxRows(options);
      if (Number.isFinite(maxRows) && declaredRows > maxRows + 5) {
        return createSpreadsheetRowLimitError(maxRows);
      }
    }

    const jsonData = spreadsheetRuntime.sheetToJson(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    const worksheetRange = worksheetRef
      ? spreadsheetRuntime.decodeRange(worksheetRef)
      : { s: { r: 0, c: 0 } };

    normalizeSpreadsheetIdentifierCells(jsonData, (rowIndex, columnIndex) => {
      const cellAddress = spreadsheetRuntime.encodeCell({
        r: worksheetRange.s.r + rowIndex,
        c: worksheetRange.s.c + columnIndex,
      });
      const cell = worksheet[cellAddress] as { v?: unknown } | undefined;
      return cell?.v;
    });

    return parseWorkbookJsonData(jsonData, options);
  } finally {
    (workbook as { SheetNames?: unknown; Sheets?: unknown }).SheetNames = null;
    (workbook as { SheetNames?: unknown; Sheets?: unknown }).Sheets = null;
    workbook = null as never;
  }
}

export async function parseExcelFile(
  filePath: string,
  options?: ParseExcelOptions,
): Promise<ParsedImportUploadResult> {
  const sizeValidation = await validateUploadFileSize(filePath, options?.maxBytes);
  if (sizeValidation) {
    return sizeValidation;
  }

  return parseExcelFileInWorker(filePath, options);
}
