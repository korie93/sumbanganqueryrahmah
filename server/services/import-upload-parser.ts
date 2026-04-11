import { parseCsvBuffer, parseCsvFile } from "./import-upload-csv-utils";
import { parseExcelBuffer, parseExcelFile } from "./import-upload-excel-utils";
import { runtimeConfig } from "../config/runtime";
import {
  isSupportedSpreadsheet,
  stripImportUploadExtension,
} from "./import-upload-file-utils";
import type { ParsedImportUploadResult } from "./import-upload-types";
export type { ImportRow, ParsedImportUploadResult } from "./import-upload-types";

export { stripImportUploadExtension };

export function parseImportUploadBuffer(filename: string, buffer: Buffer): ParsedImportUploadResult {
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  if (!isSupportedSpreadsheet(normalizedFilename)) {
    return { headers: [], rows: [], error: "Please select a CSV or Excel file (.xlsx, .xls, .xlsb)" };
  }

  if (normalizedFilename.endsWith(".csv")) {
    return parseCsvBuffer(buffer, { maxRows: runtimeConfig.runtime.importCsvMaxRows });
  }

  return parseExcelBuffer(buffer);
}

export async function parseImportUploadFile(filename: string, filePath: string): Promise<ParsedImportUploadResult> {
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  if (!isSupportedSpreadsheet(normalizedFilename)) {
    return { headers: [], rows: [], error: "Please select a CSV or Excel file (.xlsx, .xls, .xlsb)" };
  }

  if (normalizedFilename.endsWith(".csv")) {
    return parseCsvFile(filePath, { maxRows: runtimeConfig.runtime.importCsvMaxRows });
  }

  return await parseExcelFile(filePath);
}
