import { parseCsvBuffer, parseCsvFile } from "./import-upload-csv-utils";
import { parseExcelBuffer, parseExcelFile } from "./import-upload-excel-utils";
import { runtimeConfig } from "../config/runtime";
import { parseBodyLimitToBytes } from "../config/body-limit";
import {
  ImportUploadValidationError,
  isSupportedSpreadsheet,
  normalizeAndValidateImportUploadFilename,
  stripImportUploadExtension,
  UNSUPPORTED_IMPORT_UPLOAD_MESSAGE,
  validateImportUploadBufferSignature,
  validateImportUploadFileSignature,
} from "./import-upload-file-utils";
import type { ParsedImportUploadResult } from "./import-upload-types";
export type { ImportRow, ParsedImportUploadResult } from "./import-upload-types";

export { stripImportUploadExtension };

function resolveImportUploadMaxBytes() {
  return parseBodyLimitToBytes(runtimeConfig.app.bodyLimits.imports);
}

export function parseImportUploadBuffer(filename: string, buffer: Buffer): ParsedImportUploadResult {
  let normalizedFilename: string;
  try {
    normalizedFilename = normalizeAndValidateImportUploadFilename(filename);
    validateImportUploadBufferSignature(normalizedFilename, buffer);
  } catch (error) {
    return {
      headers: [],
      rows: [],
      error: error instanceof ImportUploadValidationError
        ? error.message
        : "Failed to verify the uploaded file.",
    };
  }

  const lowerFilename = normalizedFilename.toLowerCase();
  const maxBytes = resolveImportUploadMaxBytes();
  const maxRows = runtimeConfig.runtime.importCsvMaxRows;
  const maxColumns = runtimeConfig.runtime.importMaxColumns;
  const maxSheets = runtimeConfig.runtime.importMaxSheets;
  const maxCellLength = runtimeConfig.runtime.importMaxCellLength;
  if (!isSupportedSpreadsheet(lowerFilename)) {
    return { headers: [], rows: [], error: UNSUPPORTED_IMPORT_UPLOAD_MESSAGE };
  }

  if (lowerFilename.endsWith(".csv")) {
    return parseCsvBuffer(buffer, { maxRows, maxBytes, maxColumns, maxCellLength });
  }

  return parseExcelBuffer(buffer, {
    maxRows,
    maxBytes,
    maxColumns,
    maxSheets,
    maxCellLength,
  });
}

export async function parseImportUploadFile(filename: string, filePath: string): Promise<ParsedImportUploadResult> {
  let normalizedFilename: string;
  try {
    normalizedFilename = normalizeAndValidateImportUploadFilename(filename);
    await validateImportUploadFileSignature(normalizedFilename, filePath);
  } catch (error) {
    return {
      headers: [],
      rows: [],
      error: error instanceof Error ? error.message : "Failed to verify the uploaded file.",
    };
  }

  const lowerFilename = normalizedFilename.toLowerCase();
  const maxBytes = resolveImportUploadMaxBytes();
  const maxRows = runtimeConfig.runtime.importCsvMaxRows;
  const maxColumns = runtimeConfig.runtime.importMaxColumns;
  const maxSheets = runtimeConfig.runtime.importMaxSheets;
  const maxCellLength = runtimeConfig.runtime.importMaxCellLength;
  if (!isSupportedSpreadsheet(lowerFilename)) {
    return { headers: [], rows: [], error: UNSUPPORTED_IMPORT_UPLOAD_MESSAGE };
  }

  if (lowerFilename.endsWith(".csv")) {
    return parseCsvFile(filePath, { maxRows, maxBytes, maxColumns, maxCellLength });
  }

  return await parseExcelFile(filePath, {
    maxRows,
    maxBytes,
    maxColumns,
    maxSheets,
    maxCellLength,
  });
}
