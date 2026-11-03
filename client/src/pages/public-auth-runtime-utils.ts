import { formatDateTimeDDMMYYYYMalaysia } from "@/lib/date-format";
import { getAuthErrorCode } from "@/lib/auth-flow-feedback";
import { ERROR_CODES } from "@shared/error-codes";

const TEMPORARY_REQUEST_STATUSES = new Set([408, 500, 502, 503, 504]);
const TEMPORARY_REQUEST_CODES = new Set<string>([
  ERROR_CODES.INTERNAL_ERROR, ERROR_CODES.INTERNAL_FAILURE, ERROR_CODES.DATABASE_DOWN,
  ERROR_CODES.SERVICE_UNAVAILABLE, ERROR_CODES.REQUEST_TIMEOUT,
]);
const FETCH_FAILURE_MESSAGE = /^(?:failed to fetch|fetch failed|network request failed|load failed|NetworkError when attempting to fetch resource\.?)$/i;
const REQUEST_TIMEOUT_MESSAGE = /^Request timed out after \d+ms: [A-Z]+ \S+$/;

export function getPublicAuthTokenFromLocation(locationSearch?: string | null | undefined) {
  const search =
    typeof locationSearch === "string"
      ? locationSearch
      : typeof window === "undefined"
        ? ""
        : window.location.search;
  return new URLSearchParams(search).get("token") || "";
}

export function formatPublicAuthExpiry(value: string) {
  return formatDateTimeDDMMYYYYMalaysia(value, { fallback: value });
}

export function isPublicAuthAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

/** Presentation hint for a manual retry; never schedules or authorizes a request. */
export function isTemporaryPublicAuthRequestError(error: unknown): boolean {
  try {
    if (!error || typeof error !== "object" || isPublicAuthAbortError(error)) return false;
    const details = error as { status?: unknown; message?: unknown; name?: unknown };
    const message = typeof details.message === "string" ? details.message.trim() : "";
    const code = getAuthErrorCode(error);
    if (code !== null && !TEMPORARY_REQUEST_CODES.has(code)) return false;

    // HTTP denials stay authoritative even if their message resembles a network error.
    const status = typeof details.status === "number"
      ? details.status : Number(/^(\d{3}):\s*/.exec(message)?.[1]);
    if (Number.isFinite(status)) return TEMPORARY_REQUEST_STATUSES.has(status);
    if (!(error instanceof Error || error instanceof DOMException)) return false;
    if (!["Error", "TypeError", "NetworkError", "TimeoutError"].includes(error.name)) return false;

    return message === "You appear to be offline. Check your internet connection and try again."
      || FETCH_FAILURE_MESSAGE.test(message)
      || REQUEST_TIMEOUT_MESSAGE.test(message)
      || (details.name === "NetworkError" && message === "A network error occurred.")
      || (details.name === "TimeoutError" && message === "The operation timed out.");
  } catch {
    return false;
  }
}
