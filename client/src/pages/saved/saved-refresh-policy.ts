import { ApiCircuitOpenError } from "@/lib/api-client-retry";
import { isReadDeadlineError } from "@/lib/read-deadline";

type SavedRefreshPolicyOptions = {
  error: unknown;
  loadedKey: string | null;
  requestKey: string;
  currentKey: string;
};

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const OFFLINE_MESSAGE = "You appear to be offline. Check your internet connection and try again.";
const FETCH_FAILURE_MESSAGE = /^(?:failed to fetch|fetch failed|network request failed|load failed|NetworkError(?: when attempting to fetch resource\.?)?)$/i;
const REQUEST_TIMEOUT_MESSAGE = /^Request timed out after \d+ms: [A-Z]+ \S+$/;
const CIRCUIT_OPEN_MESSAGE = /^API retry circuit is open\. Try again in \d+ seconds\.$/;

/** Keeps one last-good Saved page only for a recognized temporary failure of the same request. */
export function shouldRetainSavedPage({
  error,
  loadedKey,
  requestKey,
  currentKey,
}: SavedRefreshPolicyOptions): boolean {
  if (loadedKey === null || loadedKey !== requestKey || requestKey !== currentKey) {
    return false;
  }
  return isSavedRetryableReadError(error);
}

/** Recognizes temporary Saved read failures without retrying denials or invalid responses. */
export function isSavedRetryableReadError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "AbortError") {
    return false;
  }

  const message = error.message.trim();
  // An HTTP denial must not be reclassified by words inside its response payload.
  const httpStatus = /^(\d+):\s*/.exec(message);
  if (httpStatus) {
    return TRANSIENT_HTTP_STATUSES.has(Number(httpStatus[1]));
  }
  if (isReadDeadlineError(error)) return true;
  if (
    error instanceof ApiCircuitOpenError
    || (error.name === "ApiCircuitOpenError" && CIRCUIT_OPEN_MESSAGE.test(message))
  ) {
    return true;
  }
  if (!["Error", "TypeError", "NetworkError", "TimeoutError"].includes(error.name)) {
    return false;
  }

  return message === OFFLINE_MESSAGE
    || FETCH_FAILURE_MESSAGE.test(message)
    || REQUEST_TIMEOUT_MESSAGE.test(message)
    || (error.name === "NetworkError" && message === "A network error occurred.")
    || (error.name === "TimeoutError" && message === "The operation timed out.");
}
