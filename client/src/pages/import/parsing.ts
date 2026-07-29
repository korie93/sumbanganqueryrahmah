import { loadClientSpreadsheetRuntime } from "@/lib/spreadsheet/xlsx-runtime";
import type { ImportRow, ParsedBulkResult, ParsedPreviewResult } from "@/pages/import/types";
import {
  CsvLogicalRecordAccumulator,
  parseCsvRecord,
  validateCsvHeaders,
  validateCsvRowWidth,
} from "@shared/common/csv-record-parser";
import {
  findSpreadsheetHeaderRowIndex,
  normalizeSpreadsheetIdentifierCells,
} from "@shared/common/spreadsheet-identifier-normalization";

type XlsxModule = typeof import("xlsx");

export const IMPORT_PREVIEW_MAX_CSV_ROWS = 100_000;
export const IMPORT_PREVIEW_MAX_FILE_BYTES = 8 * 1024 * 1024;

export function shouldDeferImportPreview(file: File) {
  return file.size > IMPORT_PREVIEW_MAX_FILE_BYTES;
}

function createCsvRowLimitError() {
  return `CSV import exceeds the preview row limit of ${IMPORT_PREVIEW_MAX_CSV_ROWS.toLocaleString("en-US")} rows. Split the file into smaller uploads.`;
}

function isSupportedSpreadsheet(filename: string) {
  return /\.(csv|xlsx|xlsb)$/i.test(filename);
}

export function stripImportExtension(filename: string) {
  return filename.replace(/\.(csv|xlsx|xlsb)$/i, "");
}

export const parseCsvLine = parseCsvRecord;

export function normalizeExcelMatrixRows(value: unknown): unknown[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row) => (Array.isArray(row) ? row : row == null ? [] : [row]));
}

async function parseCsvFile(file: File): Promise<ParsedPreviewResult> {
  const text = (await file.text()).replace(/^\ufeff/, "");
  const lines = text.split(/\r\n|\n|\r/);
  const recordAccumulator = new CsvLogicalRecordAccumulator();
  let headers: string[] | null = null;
  const rows: ImportRow[] = [];

  for (const line of lines) {
    const logicalRecord = recordAccumulator.appendPhysicalLine(line);
    if (logicalRecord === null || !logicalRecord.trim()) {
      continue;
    }

    const values = parseCsvLine(logicalRecord);
    if (!headers) {
      const headerError = validateCsvHeaders(values);
      if (headerError) {
        return { headers: [], rows: [], error: headerError };
      }
      headers = values;
      continue;
    }

    const rowWidthError = validateCsvRowWidth(headers, values);
    if (rowWidthError) {
      return { headers: [], rows: [], error: rowWidthError };
    }
    const row: ImportRow = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] ?? "";
    });

    if (Object.values(row).some((value) => value !== "")) {
      if (rows.length >= IMPORT_PREVIEW_MAX_CSV_ROWS) {
        return { headers: [], rows: [], error: createCsvRowLimitError() };
      }
      rows.push(row);
    }
  }

  const finalRecord = recordAccumulator.finish();
  if (finalRecord.error) {
    return { headers: [], rows: [], error: finalRecord.error };
  }

  if (!headers) {
    return { headers: [], rows: [], error: "CSV file is empty." };
  }

  return { headers, rows };
}

/**
 * Parse an Excel ArrayBuffer into headers + rows.
 * Shared by both preview and bulk-import paths to avoid duplicating the
 * workbook-read / sheet-to-json logic (and the memory that comes with it).
 */
function parseExcelBuffer(
  xlsx: XlsxModule,
  arrayBuffer: ArrayBuffer,
): { headers: string[]; rows: ImportRow[]; error?: string } {
  let workbook: ReturnType<XlsxModule["read"]> | null;
  try {
    workbook = xlsx.read(arrayBuffer, { type: "array", cellDates: true, cellNF: false, cellText: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read Excel file";
    if (message.includes("password") || message.includes("encrypt")) {
      return { headers: [], rows: [], error: "File is password protected" };
    }
    if (message.includes("Unsupported") || message.includes("corrupt")) {
      return { headers: [], rows: [], error: "File is corrupted or unsupported format" };
    }
    return { headers: [], rows: [], error: message };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [], error: "Excel file does not have any sheets." };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    return { headers: [], rows: [], error: "Excel sheet data is unavailable." };
  }

  const jsonData = normalizeExcelMatrixRows(
    xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false }),
  );
  const worksheetRange = worksheet["!ref"]
    ? xlsx.utils.decode_range(worksheet["!ref"])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };

  normalizeSpreadsheetIdentifierCells(jsonData, (rowIndex, columnIndex) => {
    const cellAddress = xlsx.utils.encode_cell({
      r: worksheetRange.s.r + rowIndex,
      c: worksheetRange.s.c + columnIndex,
    });
    const cell = worksheet[cellAddress] as { v?: unknown } | undefined;
    return cell?.v;
  });

  // Null out workbook references early to allow GC to reclaim memory
  workbook.SheetNames = [];
  workbook.Sheets = {};
  workbook = null;

  if (jsonData.length === 0) {
    return { headers: [], rows: [], error: "Excel file is empty." };
  }

  const headerRowIndex = findSpreadsheetHeaderRowIndex(jsonData);

  const headers = jsonData[headerRowIndex].map((header, index) => {
    const value = String(header || "").trim();
    return value || `Column_${index + 1}`;
  });

  const rows: ImportRow[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < jsonData.length; rowIndex += 1) {
    const rowData = jsonData[rowIndex];
    const hasAnyData = rowData.some((cell, index) => {
      if (index >= headers.length) return false;
      return String(cell ?? "").trim() !== "";
    });

    if (!hasAnyData) continue;

    const row: ImportRow = {};
    headers.forEach((header, index) => {
      const cellValue = rowData[index];
      row[header] = cellValue instanceof Date ? cellValue.toLocaleDateString("en-MY") : String(cellValue ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

async function parseExcelFile(file: File): Promise<ParsedPreviewResult> {
  const arrayBuffer = await file.arrayBuffer();
  const { module: xlsx } = await loadClientSpreadsheetRuntime();
  return parseExcelBuffer(xlsx, arrayBuffer);
}

export async function readDeferredCsvHeaders(file: File): Promise<string[]> {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return [];
  }

  const prefix = await file.slice(0, Math.min(file.size, 64 * 1024)).text();
  const lines = prefix.replace(/^\ufeff/, "").split(/\r\n|\n|\r/);
  const recordAccumulator = new CsvLogicalRecordAccumulator();
  for (const line of lines) {
    const logicalRecord = recordAccumulator.appendPhysicalLine(line);
    if (logicalRecord === null || !logicalRecord.trim()) {
      continue;
    }

    const headers = parseCsvLine(logicalRecord);
    return validateCsvHeaders(headers) ? [] : headers;
  }

  return [];
}

export async function parseImportPreview(file: File): Promise<ParsedPreviewResult> {
  const fileName = file.name.toLowerCase();
  if (!isSupportedSpreadsheet(fileName)) {
    return { headers: [], rows: [], error: "Please select a CSV, XLSX, or XLSB file." };
  }

  return fileName.endsWith(".csv") ? parseCsvFile(file) : parseExcelFile(file);
}

export async function parseImportFileForBulk(file: File): Promise<ParsedBulkResult> {
  const fileName = file.name.toLowerCase();
  if (!isSupportedSpreadsheet(fileName)) {
    return { data: [], error: "Please select a CSV, XLSX, or XLSB file." };
  }

  try {
    if (fileName.endsWith(".csv")) {
      const parsed = await parseCsvFile(file);
      return { data: parsed.rows, error: parsed.error };
    }

    const arrayBuffer = await file.arrayBuffer();
    const { module: xlsx } = await loadClientSpreadsheetRuntime();
    const result = parseExcelBuffer(xlsx, arrayBuffer);
    if (result.error) {
      return { data: [], error: result.error };
    }
    return { data: result.rows };
  } catch (error: unknown) {
    return { data: [], error: error instanceof Error ? error.message : "Failed to parse file" };
  }
}
