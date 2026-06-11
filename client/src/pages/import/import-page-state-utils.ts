import { stripImportExtension } from "@/pages/import/parsing";
import type { BulkFileResult } from "@/pages/import/types";
import {
  buildImportMutationFingerprint,
  createImportMutationIdempotencyKey,
} from "@/lib/api/imports";
import {
  buildImportFileTooLargeMessage,
  isImportFileTooLarge,
} from "@/pages/import/upload-limits";

const SUPPORTED_IMPORT_FILE_PATTERN = /\.(csv|xlsx|xlsb)$/i;

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
    const importName = stripImportExtension(selectedFile.name);
    const idempotencyKey = createImportMutationIdempotencyKey();
    const idempotencyFingerprint = buildImportMutationFingerprint(importName, selectedFile);
    return isImportFileTooLarge(selectedFile, importUploadLimitBytes)
      ? {
          id,
          filename: selectedFile.name,
          sizeBytes: selectedFile.size,
          status: "error",
          blocked: true,
          error: buildImportFileTooLargeMessage(selectedFile.size, importUploadLimitBytes),
          idempotencyKey,
          idempotencyFingerprint,
        }
      : {
          id,
          filename: selectedFile.name,
          sizeBytes: selectedFile.size,
          status: "pending",
          idempotencyKey,
          idempotencyFingerprint,
        };
  });
}

export function getRetryableBulkImportIndexes(results: BulkFileResult[]) {
  return results.flatMap((result, index) => (
    result.status === "pending" || (result.status === "error" && !result.blocked)
      ? [index]
      : []
  ));
}

export function resolveNextImportName(currentImportName: string, filename: string) {
  if (currentImportName) {
    return currentImportName;
  }

  return stripImportExtension(filename);
}

export function shouldSaveSingleImportFromOriginalFile(
  file: File | null,
  parsedRowCount: number,
  previewDeferred = false,
) {
  if (!file || (parsedRowCount < 1 && !previewDeferred)) {
    return false;
  }

  return SUPPORTED_IMPORT_FILE_PATTERN.test(file.name);
}

export function summarizeBulkImportResults(results: BulkFileResult[]) {
  return {
    successCount: results.filter((result) => result.status === "success").length,
    blockedErrorCount: results.filter((result) => result.status === "error" && result.blocked).length,
    errorCount: results.filter((result) => result.status === "error" && !result.blocked).length,
  };
}
