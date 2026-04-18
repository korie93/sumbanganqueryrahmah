import { parseCsvBuffer, parseCsvFile } from "./import-upload-csv-utils";
import { parseExcelBuffer, parseExcelFile } from "./import-upload-excel-utils";
import { runtimeConfig } from "../config/runtime";
import { parseBodyLimitToBytes } from "../config/body-limit";
import {
  isSupportedSpreadsheet,
  stripImportUploadExtension,
} from "./import-upload-file-utils";
import type { ParsedImportUploadResult } from "./import-upload-types";
export type { ImportRow, ParsedImportUploadResult } from "./import-upload-types";

export { stripImportUploadExtension };

function resolveImportUploadMaxBytes() {
  return parseBodyLimitToBytes(runtimeConfig.app.bodyLimits.imports);
}

export function parseImportUploadBuffer(filename: string, buffer: Buffer): ParsedImportUploadResult {
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  const maxBytes = resolveImportUploadMaxBytes();
  const maxRows = runtimeConfig.runtime.importCsvMaxRows;
  if (!isSupportedSpreadsheet(normalizedFilename)) {
    return { headers: [], rows: [], error: "Please select a CSV or Excel file (.xlsx, .xls, .xlsb)" };
  }

  if (normalizedFilename.endsWith(".csv")) {
    return parseCsvBuffer(buffer, { maxRows, maxBytes });
  }

  return parseExcelBuffer(buffer, { maxRows, maxBytes });
}

export async function parseImportUploadFile(
  filename: string,
  filePath: string,
  options?: {
    allowedRootDir?: string;
  },
): Promise<ParsedImportUploadResult> {
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  const maxBytes = resolveImportUploadMaxBytes();
  const maxRows = runtimeConfig.runtime.importCsvMaxRows;
  if (!isSupportedSpreadsheet(normalizedFilename)) {
    return { headers: [], rows: [], error: "Please select a CSV or Excel file (.xlsx, .xls, .xlsb)" };
  }

  if (normalizedFilename.endsWith(".csv")) {
    return parseCsvFile(filePath, {
      maxRows,
      maxBytes,
      ...(options?.allowedRootDir ? { allowedRootDir: options.allowedRootDir } : {}),
    });
  }

  return await parseExcelFile(filePath, { maxRows, maxBytes });
}
