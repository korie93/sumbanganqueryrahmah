import { promises as fs } from "node:fs";
import type { ParsedImportUploadResult } from "./import-upload-types";

const SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN = /\.(csv|xlsx|xls|xlsb)$/i;
export const IMPORT_UPLOAD_TOO_LARGE_MESSAGE = "The selected file is too large to import. Please split it into smaller files and try again.";

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

export function createUploadFileTooLargeError(): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: IMPORT_UPLOAD_TOO_LARGE_MESSAGE,
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
    ? createUploadFileTooLargeError()
    : null;
}

export function isSupportedSpreadsheet(filename: string) {
  return SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN.test(filename);
}

export function stripImportUploadExtension(filename: string) {
  return filename.replace(SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN, "");
}
