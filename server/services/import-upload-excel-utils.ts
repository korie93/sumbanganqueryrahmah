import fs from "node:fs";
import * as xlsx from "xlsx";
import {
  createUploadFileAccessError,
  createUploadFileTooLargeError,
  isFileAccessError,
  validateUploadFileSize,
} from "./import-upload-file-utils";
import type { ImportRow, ParsedImportUploadResult } from "./import-upload-types";

type ParseExcelOptions = {
  maxRows?: number;
  maxBytes?: number;
};

function mapExcelReadError(error: unknown): ParsedImportUploadResult {
  const message = error instanceof Error ? error.message : "Failed to read Excel file";
  if (message.includes("password") || message.includes("encrypt")) {
    return { headers: [], rows: [], error: "File is password protected" };
  }
  if (message.includes("Unsupported") || message.includes("corrupt")) {
    return { headers: [], rows: [], error: "File is corrupted or unsupported format" };
  }
  return { headers: [], rows: [], error: message };
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

function parseWorkbookJsonData(jsonData: unknown[][], options?: ParseExcelOptions): ParsedImportUploadResult {
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
    return createUploadFileTooLargeError();
  }

  let workbook;
  try {
    workbook = xlsx.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellNF: false,
      cellText: false,
    });
  } catch (error: unknown) {
    return mapExcelReadError(error);
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [], error: "Excel file does not have any sheets." };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = xlsx.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  (workbook as { SheetNames?: unknown; Sheets?: unknown }).SheetNames = null;
  (workbook as { SheetNames?: unknown; Sheets?: unknown }).Sheets = null;
  workbook = null as never;

  return parseWorkbookJsonData(jsonData, options);
}

export async function parseExcelFile(
  filePath: string,
  options?: ParseExcelOptions,
): Promise<ParsedImportUploadResult> {
  const sizeValidation = await validateUploadFileSize(filePath, options?.maxBytes);
  if (sizeValidation) {
    return sizeValidation;
  }

  let buffer: Buffer;
  try {
    buffer = await fs.promises.readFile(filePath);
  } catch (error) {
    if (isFileAccessError(error)) {
      return createUploadFileAccessError();
    }
    const message = error instanceof Error ? error.message : "Failed to read Excel file";
    return { headers: [], rows: [], error: message };
  }

  return parseExcelBuffer(buffer, options);
}
