const BODY_LIMIT_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  k: 1024,
  mb: 1024 * 1024,
  m: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
  g: 1024 * 1024 * 1024,
};

export const DEFAULT_IMPORT_BODY_LIMIT = "64mb";
export const DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES = 64 * 1024 * 1024;

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
