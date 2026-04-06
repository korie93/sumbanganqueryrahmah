import type { ParsedImportUploadResult } from "./import-upload-types";

const SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN = /\.(csv|xlsx|xls|xlsb)$/i;

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

export function isSupportedSpreadsheet(filename: string) {
  return SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN.test(filename);
}

export function stripImportUploadExtension(filename: string) {
  return filename.replace(SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN, "");
}
