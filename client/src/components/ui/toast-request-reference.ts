const MAX_TOAST_REQUEST_ID_LENGTH = 128;
const MIN_TOAST_REQUEST_ID_LENGTH = 3;
const SAFE_TOAST_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*[A-Za-z0-9]$/;

export function normalizeToastRequestId(value: unknown): string | null {
  const normalized = String(value || "").trim();

  if (
    normalized.length < MIN_TOAST_REQUEST_ID_LENGTH
    || normalized.length > MAX_TOAST_REQUEST_ID_LENGTH
    || !SAFE_TOAST_REQUEST_ID_PATTERN.test(normalized)
  ) {
    return null;
  }

  return normalized;
}
