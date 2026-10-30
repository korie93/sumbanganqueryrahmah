import { ApiCircuitOpenError } from "@/lib/api-client-retry";
import { isReadDeadlineError } from "@/lib/read-deadline";
import type { ColumnFilter } from "@/pages/viewer/types";
import { isImportDataFilterActive, isImportFilterRangeOperator } from "@shared/common/import-data-filters";
import type { ImportDataNumericSort } from "@shared/common/import-data-sort";

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const OFFLINE_MESSAGE = "You appear to be offline. Check your internet connection and try again.";
const FETCH_FAILURE_MESSAGE = /^(?:failed to fetch|fetch failed|network request failed|load failed|NetworkError(?: when attempting to fetch resource\.?)?)$/i;
const REQUEST_TIMEOUT_MESSAGE = /^Request timed out after \d+ms: [A-Z]+ \S+$/;
const CIRCUIT_OPEN_MESSAGE = /^API retry circuit is open\. Try again in \d+ seconds\.$/;

/** Allows explicit retry only for recognized temporary Viewer read failures. */
export function isViewerRetryableError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "AbortError") return false;

  const message = error.message.trim();
  // HTTP denials remain authoritative even when their payload mentions a network failure.
  const httpStatus = /^(\d+):\s*/.exec(message);
  if (httpStatus) return TRANSIENT_HTTP_STATUSES.has(Number(httpStatus[1]));
  if (isReadDeadlineError(error)) return true;
  if (
    error instanceof ApiCircuitOpenError
    || (error.name === "ApiCircuitOpenError" && CIRCUIT_OPEN_MESSAGE.test(message))
  ) return true;
  if (!["Error", "TypeError", "NetworkError", "TimeoutError"].includes(error.name)) return false;

  return message === OFFLINE_MESSAGE
    || FETCH_FAILURE_MESSAGE.test(message)
    || REQUEST_TIMEOUT_MESSAGE.test(message)
    || (error.name === "NetworkError" && message === "A network error occurred.")
    || (error.name === "TimeoutError" && message === "The operation timed out.");
}

/** Identifies a Viewer query without coupling server semantics to temporary filter row IDs. */
export function buildViewerQueryKey(
  importId: string | undefined,
  pageSize: number,
  search: string,
  filters: readonly ColumnFilter[],
  isCleared: boolean,
  numericSort?: ImportDataNumericSort | null | undefined,
): string {
  const activeFilters = filters
    .filter(isImportDataFilterActive)
    .map(({ column, operator, value, valueTo }) => isImportFilterRangeOperator(operator)
      ? [column, operator, value, valueTo]
      : [column, operator, value]);
  const query = [importId, pageSize, search.trim(), activeFilters, isCleared];
  return JSON.stringify(numericSort ? [...query, [numericSort.column, numericSort.direction]] : query);
}
