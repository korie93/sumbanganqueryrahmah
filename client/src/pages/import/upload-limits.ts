export const DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES = 64 * 1024 * 1024;

export function resolveImportUploadLimitBytes(importUploadLimitBytes?: number) {
  if (!Number.isFinite(importUploadLimitBytes) || Number(importUploadLimitBytes) < 1) {
    return DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES;
  }

  return Math.floor(Number(importUploadLimitBytes));
}

export function formatImportUploadSize(bytes: number) {
  const normalizedBytes = Math.max(1, Math.floor(bytes));
  if (normalizedBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(normalizedBytes / 1024))} KB`;
  }

  const sizeInMb = normalizedBytes / (1024 * 1024);
  return sizeInMb >= 10
    ? `${Math.round(sizeInMb)} MB`
    : `${sizeInMb.toFixed(1)} MB`;
}

export function isImportFileTooLarge(
  file: Pick<File, "size">,
  importUploadLimitBytes?: number,
) {
  return Number(file?.size || 0) > resolveImportUploadLimitBytes(importUploadLimitBytes);
}

export function buildImportFileTooLargeMessage(
  fileSizeBytes: number,
  importUploadLimitBytes?: number,
) {
  const limitBytes = resolveImportUploadLimitBytes(importUploadLimitBytes);
  return `The selected file is ${formatImportUploadSize(fileSizeBytes)}, which exceeds the ${formatImportUploadSize(limitBytes)} upload limit. Split it into smaller files or increase the server upload limit.`;
}
