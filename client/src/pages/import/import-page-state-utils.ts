import { stripImportExtension } from "@/pages/import/parsing";
import type { BulkFileResult } from "@/pages/import/types";
import {
  buildImportFileTooLargeMessage,
  isImportFileTooLarge,
} from "@/pages/import/upload-limits";

const SUPPORTED_IMPORT_FILE_PATTERN = /\.(csv|xlsx|xls|xlsb)$/i;

export function isImportAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function filterSupportedImportFiles(files: File[]) {
  return files.filter((candidate) => SUPPORTED_IMPORT_FILE_PATTERN.test(candidate.name));
}

export function buildBulkImportSelectionResults(
  files: File[],
  importUploadLimitBytes: number,
): BulkFileResult[] {
  return files.map((selectedFile, index) => {
    const id = `${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}:${index}`;
    return isImportFileTooLarge(selectedFile, importUploadLimitBytes)
      ? {
          id,
          filename: selectedFile.name,
          status: "error",
          blocked: true,
          error: buildImportFileTooLargeMessage(selectedFile.size, importUploadLimitBytes),
        }
      : {
          id,
          filename: selectedFile.name,
          status: "pending",
        };
  });
}

export function resolveNextImportName(currentImportName: string, filename: string) {
  if (currentImportName) {
    return currentImportName;
  }

  return stripImportExtension(filename);
}

export function summarizeBulkImportResults(results: BulkFileResult[]) {
  return {
    successCount: results.filter((result) => result.status === "success").length,
    blockedErrorCount: results.filter((result) => result.status === "error" && result.blocked).length,
    errorCount: results.filter((result) => result.status === "error" && !result.blocked).length,
  };
}
