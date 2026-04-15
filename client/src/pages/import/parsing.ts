import type { ImportRow, ParsedBulkResult, ParsedPreviewResult } from "@/pages/import/types";
import { createRetryableModuleLoader } from "@/lib/retryable-module-loader";

type XlsxModule = typeof import("xlsx");

export const IMPORT_PREVIEW_MAX_CSV_ROWS = 100_000;

const loadXlsx = createRetryableModuleLoader<XlsxModule>(() => import("xlsx"));

function createCsvRowLimitError() {
  return `CSV import exceeds the preview row limit of ${IMPORT_PREVIEW_MAX_CSV_ROWS.toLocaleString("en-US")} rows. Split the file into smaller uploads.`;
}

function isSupportedSpreadsheet(filename: string) {
  return /\.(csv|xlsx|xls|xlsb)$/i.test(filename);
}

export function stripImportExtension(filename: string) {
  return filename.replace(/\.(csv|xlsx|xls|xlsb)$/i, "");
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function normalizeExcelMatrixRows(value: unknown): unknown[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row) => (Array.isArray(row) ? row : row == null ? [] : [row]));
}

function findHeaderLine(lines: string[]) {
  let headerLineIndex = 0;
  while (headerLineIndex < lines.length && !lines[headerLineIndex].trim()) {
    headerLineIndex += 1;
  }
  return headerLineIndex;
}

async function parseCsvFile(file: File): Promise<ParsedPreviewResult> {
  const text = await file.text();
  const lines = text.split(/\r?\n/);

  if (lines.length === 0) {
    return { headers: [], rows: [], error: "CSV file is empty." };
  }

  const headerLineIndex = findHeaderLine(lines);
  if (headerLineIndex >= lines.length) {
    return { headers: [], rows: [], error: "CSV file is empty." };
  }

  const headers = parseCsvLine(lines[headerLineIndex]);
  const rows: ImportRow[] = [];

  for (let index = headerLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const values = parseCsvLine(line);
    const row: ImportRow = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] || "";
    });

    if (Object.values(row).some((value) => value !== "")) {
      if (rows.length >= IMPORT_PREVIEW_MAX_CSV_ROWS) {
        return { headers: [], rows: [], error: createCsvRowLimitError() };
      }
      rows.push(row);
    }
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

  // Null out workbook references early to allow GC to reclaim memory
  workbook.SheetNames = [];
  workbook.Sheets = {};
  workbook = null;

  if (jsonData.length === 0) {
    return { headers: [], rows: [], error: "Excel file is empty." };
  }

  let headerRowIndex = 0;
  let maxNonEmptyCols = 0;

  for (let index = 0; index < Math.min(5, jsonData.length); index += 1) {
    const row = jsonData[index];
    const nonEmptyCount = row.filter((cell) => cell !== "" && cell !== null && cell !== undefined).length;
    if (nonEmptyCount > maxNonEmptyCols) {
      maxNonEmptyCols = nonEmptyCount;
      headerRowIndex = index;
    }
  }

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
  const xlsx = await loadXlsx();
  return parseExcelBuffer(xlsx, arrayBuffer);
}

export async function parseImportPreview(file: File): Promise<ParsedPreviewResult> {
  const fileName = file.name.toLowerCase();
  if (!isSupportedSpreadsheet(fileName)) {
    return { headers: [], rows: [], error: "Please select a CSV or Excel file (.xlsx, .xls, .xlsb)" };
  }

  return fileName.endsWith(".csv") ? parseCsvFile(file) : parseExcelFile(file);
}

export async function parseImportFileForBulk(file: File): Promise<ParsedBulkResult> {
  const fileName = file.name.toLowerCase();
  if (!isSupportedSpreadsheet(fileName)) {
    return { data: [], error: "Unsupported file format" };
  }

  try {
    if (fileName.endsWith(".csv")) {
      const parsed = await parseCsvFile(file);
      return { data: parsed.rows, error: parsed.error };
    }

    const arrayBuffer = await file.arrayBuffer();
    const xlsx = await loadXlsx();
    const result = parseExcelBuffer(xlsx, arrayBuffer);
    if (result.error) {
      return { data: [], error: result.error };
    }
    return { data: result.rows };
  } catch (error: unknown) {
    return { data: [], error: error instanceof Error ? error.message : "Failed to parse file" };
  }
}
