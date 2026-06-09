const MAX_TOAST_REQUEST_ID_LENGTH = 128;
const SAFE_TOAST_REQUEST_ID_PATTERN = /[^A-Za-z0-9._:-]/g;

export function normalizeToastRequestId(value: unknown): string | null {
  const normalized = String(value || "")
    .replace(SAFE_TOAST_REQUEST_ID_PATTERN, "")
    .slice(0, MAX_TOAST_REQUEST_ID_LENGTH);

  return normalized || null;
}
