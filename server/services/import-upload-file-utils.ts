import { promises as fs } from "node:fs";
import {
  DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
  formatBodyLimitBytes,
} from "../config/body-limit";
import type { ParsedImportUploadResult } from "./import-upload-types";

const SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN = /\.(csv|xlsx|xlsb)$/i;
export const UNSUPPORTED_IMPORT_UPLOAD_MESSAGE = "Please select a CSV, XLSX, or XLSB file.";

export function buildImportUploadTooLargeMessage(
  maxBytes: number = DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
) {
  const safeMaxBytes = Number.isFinite(maxBytes) && maxBytes > 0
    ? Math.floor(maxBytes)
    : DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES;
  return `The selected file is too large to import. Maximum upload size is ${formatBodyLimitBytes(safeMaxBytes)}. Split it into smaller files or ask an administrator to raise the import upload limit.`;
}

export const IMPORT_UPLOAD_TOO_LARGE_MESSAGE = buildImportUploadTooLargeMessage();

export function isFileAccessError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  return ["ENOENT", "EACCES", "EPERM", "EBUSY"].includes(code);
}

export function createUploadFileAccessError(): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: "Cannot access the uploaded file. Please try again.",
  };
}

export function createUploadFileTooLargeError(maxBytes?: number): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: buildImportUploadTooLargeMessage(maxBytes),
  };
}

export async function validateUploadFileSize(
  filePath: string,
  maxBytes?: number,
): Promise<ParsedImportUploadResult | null> {
  if (!Number.isFinite(maxBytes) || (maxBytes as number) <= 0) {
    return null;
  }

  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch (error) {
    if (isFileAccessError(error)) {
      return createUploadFileAccessError();
    }
    throw error;
  }

  return stats.size > (maxBytes as number)
    ? createUploadFileTooLargeError(maxBytes)
    : null;
}

export function isSupportedSpreadsheet(filename: string) {
  return SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN.test(filename);
}

export function stripImportUploadExtension(filename: string) {
  return filename.replace(SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN, "");
}
