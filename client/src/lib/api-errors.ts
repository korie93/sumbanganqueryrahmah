import {
  getHttpStatusErrorMessage,
  isGenericApiErrorMessage,
  UNKNOWN_API_ERROR_MESSAGE,
} from "@/constants/errorMessages";
import { safeJsonParseResult } from "@/lib/utils/safe-json";

export function getApiErrorMessage(
  error: unknown,
  fallback = UNKNOWN_API_ERROR_MESSAGE,
) {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const message = String((error as { message?: string }).message || "").trim();
  if (!message) {
    return fallback;
  }

  const jsonPart = message.replace(/^\d+:\s*/, "");
  const statusMatch = message.match(/^(\d+):\s*/);
  const status = statusMatch?.[1] ? Number.parseInt(statusMatch[1], 10) : null;
  const parsedResult = safeJsonParseResult<Record<string, unknown>>(jsonPart);
  if (parsedResult.ok && parsedResult.data && typeof parsedResult.data === "object") {
    const parsed = parsedResult.data as {
      error?: { message?: unknown; retryAfterMs?: unknown };
      message?: unknown;
      retryAfterMs?: unknown;
    };
    const parsedMessage = String(parsed?.error?.message || parsed?.message || "").trim();
    const retryAfterMs = Number(parsed?.retryAfterMs || parsed?.error?.retryAfterMs);
    if (parsedMessage && !isGenericApiErrorMessage(parsedMessage)) {
      return parsedMessage;
    }
    return getHttpStatusErrorMessage(
      status,
      Number.isFinite(retryAfterMs) ? { retryAfterMs } : undefined,
    );
  }

  return isGenericApiErrorMessage(message)
    ? getHttpStatusErrorMessage(status)
    : message;
}
