import { stripImportExtension } from "@/pages/import/parsing";
import type { BulkFileResult } from "@/pages/import/types";
import {
  buildImportMutationFingerprint,
  createImportMutationIdempotencyKey,
} from "@/lib/api/imports";
import { safeJsonParseResult } from "@/lib/utils/safe-json";
import {
  buildImportFileTooLargeMessage,
  isImportFileTooLarge,
} from "@/pages/import/upload-limits";
import { ERROR_CODES } from "@shared/error-codes";

const SUPPORTED_IMPORT_FILE_PATTERN = /\.(csv|xlsx|xlsb)$/i;
const IMPORT_DUPLICATE_MESSAGE =
  "Fail ini sudah pernah diimport. Buka Saved Imports untuk lihat data sedia ada, atau pilih fail lain.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPayloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function readNestedPayloadString(payload: Record<string, unknown>, key: string): string {
  const nested = payload.error;
  return isRecord(nested) ? readPayloadString(nested, key) : "";
}

function isDuplicateImportPayload(payload: Record<string, unknown>): boolean {
  const code = readPayloadString(payload, "code") || readNestedPayloadString(payload, "code");
  if (code === ERROR_CODES.IMPORT_DUPLICATE_FILE) {
    return true;
  }

  const message = readPayloadString(payload, "message") || readNestedPayloadString(payload, "message");
  return /already\s+(been\s+)?imported/i.test(message);
}

function readImportPayloadMessage(payload: Record<string, unknown>): string {
  return readNestedPayloadString(payload, "message") || readPayloadString(payload, "message");
}

function normalizeImportErrorMessage(message: string): string | null {
  const normalizedMessage = String(message || "").trim();
  if (!normalizedMessage) {
    return null;
  }

  if (/already\s+(been\s+)?imported/i.test(normalizedMessage)) {
    return IMPORT_DUPLICATE_MESSAGE;
  }

  const jsonPart = normalizedMessage.replace(/^\d+:\s*/, "");
  const parsed = safeJsonParseResult<unknown>(jsonPart, {
    maxDepth: 8,
    maxNodes: 250,
    maxRawLength: 32_000,
    maxStringLength: 4_000,
  });

  if (!parsed.ok || !isRecord(parsed.data)) {
    return normalizedMessage;
  }

  if (isDuplicateImportPayload(parsed.data)) {
    return IMPORT_DUPLICATE_MESSAGE;
  }

  return readImportPayloadMessage(parsed.data) || normalizedMessage;
}

export function isImportAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function readImportErrorMessage(error: unknown, fallback: string) {
  const directCode = isRecord(error) ? readPayloadString(error, "code") : "";
  if (directCode === ERROR_CODES.IMPORT_DUPLICATE_FILE) {
    return IMPORT_DUPLICATE_MESSAGE;
  }

  const message = error instanceof Error
    ? error.message
    : isRecord(error) && typeof error.message === "string"
      ? error.message
      : "";

  return normalizeImportErrorMessage(message) || fallback;
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
