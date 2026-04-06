import fs from "node:fs";
import * as xlsx from "xlsx";
import {
  createUploadFileAccessError,
  isFileAccessError,
} from "./import-upload-file-utils";
import type { ImportRow, ParsedImportUploadResult } from "./import-upload-types";

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

function parseWorkbookJsonData(jsonData: unknown[][]): ParsedImportUploadResult {
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
      row[header] =
        cellValue instanceof Date
          ? cellValue.toLocaleDateString("en-MY")
          : String(cellValue ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

export function parseExcelBuffer(buffer: Buffer): ParsedImportUploadResult {
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

  return parseWorkbookJsonData(jsonData);
}

export async function parseExcelFile(filePath: string): Promise<ParsedImportUploadResult> {
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

  return parseExcelBuffer(buffer);
}
