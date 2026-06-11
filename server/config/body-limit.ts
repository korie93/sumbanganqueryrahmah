const BODY_LIMIT_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  k: 1024,
  mb: 1024 * 1024,
  m: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  g: 1024 * 1024 * 1024,
};

export const DEFAULT_IMPORT_BODY_LIMIT = "96mb";
export const DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES = 96 * 1024 * 1024;
export const MIN_IMPORT_UPLOAD_LIMIT_BYTES = 1 * 1024 * 1024;
export const MAX_IMPORT_UPLOAD_LIMIT_BYTES = 512 * 1024 * 1024;

export function parseBodyLimitToBytes(
  rawValue: string | null | undefined,
  fallbackBytes: number = DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) {
    return fallbackBytes;
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(b|kb|k|mb|m|gb|g)?$/i);
  if (!match) {
    return fallbackBytes;
  }

  const numericValue = Number(match[1]);
  const multiplier = BODY_LIMIT_UNITS[String(match[2] || "b").toLowerCase()] || 1;
  const resolvedBytes = Math.floor(numericValue * multiplier);

  if (!Number.isFinite(resolvedBytes) || resolvedBytes < 1) {
    return fallbackBytes;
  }

  return resolvedBytes;
}

export function formatBodyLimitBytes(bytes: number) {
  const normalizedBytes = Math.max(1, Math.floor(Number(bytes) || 1));
  if (normalizedBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(normalizedBytes / 1024))} KB`;
  }

  const sizeInMb = normalizedBytes / (1024 * 1024);
  return sizeInMb >= 10
    ? `${Math.round(sizeInMb)} MB`
    : `${sizeInMb.toFixed(1)} MB`;
}

export function parseImportMaxFileSizeMbToBytes(
  rawValue: string | null | undefined,
  fallbackBytes: number = DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
) {
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return fallbackBytes;
  }

  if (!/^\d+$/.test(normalized)) {
    return fallbackBytes;
  }

  const parsedMb = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsedMb) || parsedMb < 1 || parsedMb > 512) {
    return fallbackBytes;
  }

  return parsedMb * 1024 * 1024;
}

export function resolveImportBodyLimit(
  rawBodyLimit: string | null | undefined,
  rawMaxFileSizeMb: string | null | undefined,
) {
  const normalizedMaxFileSizeMb = String(rawMaxFileSizeMb || "").trim();
  if (normalizedMaxFileSizeMb) {
    const limitBytes = parseImportMaxFileSizeMbToBytes(
      normalizedMaxFileSizeMb,
      DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
    );
    return `${Math.floor(limitBytes / (1024 * 1024))}mb`;
  }

  const normalizedBodyLimit = String(rawBodyLimit || "").trim();
  return normalizedBodyLimit || DEFAULT_IMPORT_BODY_LIMIT;
}
