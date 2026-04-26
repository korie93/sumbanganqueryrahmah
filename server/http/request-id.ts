import { randomUUID } from "node:crypto";

const REQUEST_ID_MAX_LENGTH = 128;
const REQUEST_ID_SAFE_CHAR_PATTERN = /[A-Za-z0-9._:-]/g;

export function sanitizeRequestId(rawRequestId: unknown): string {
  const raw = String(rawRequestId || "").trim();
  if (!raw) {
    return "";
  }

  const safeCharacters = raw.match(REQUEST_ID_SAFE_CHAR_PATTERN)?.join("") || "";
  return safeCharacters.slice(0, REQUEST_ID_MAX_LENGTH);
}

export function resolveRequestId(rawRequestId: unknown): string {
  return sanitizeRequestId(rawRequestId) || randomUUID();
}
