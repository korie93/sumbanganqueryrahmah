import {
  getHttpStatusErrorMessage,
  isGenericApiErrorMessage,
  UNKNOWN_API_ERROR_MESSAGE,
} from "@/constants/errorMessages";

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
  try {
    const parsed = JSON.parse(jsonPart);
    const parsedMessage = String(parsed?.error?.message || parsed?.message || "").trim();
    const retryAfterMs = Number(parsed?.retryAfterMs || parsed?.error?.retryAfterMs);
    if (parsedMessage && !isGenericApiErrorMessage(parsedMessage)) {
      return parsedMessage;
    }
    return getHttpStatusErrorMessage(
      status,
      Number.isFinite(retryAfterMs) ? { retryAfterMs } : undefined,
    );
  } catch {
    return isGenericApiErrorMessage(message)
      ? getHttpStatusErrorMessage(status)
      : message;
  }
}
