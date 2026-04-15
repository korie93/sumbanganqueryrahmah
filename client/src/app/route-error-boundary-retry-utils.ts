const CHUNK_LOAD_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i;

export const APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS = 3;
const APP_ROUTE_CHUNK_RETRY_INITIAL_DELAY_MS = 400;
const APP_ROUTE_CHUNK_RETRY_MAX_DELAY_MS = 1_600;

function normalizeRouteErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.trim() : String(error || "").trim();
}

export function isChunkLoadRouteError(error: unknown): boolean {
  return CHUNK_LOAD_ERROR_PATTERN.test(normalizeRouteErrorMessage(error));
}

export function resolveChunkLoadRetryDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(0, Math.trunc(attempt));
  const delayMs = APP_ROUTE_CHUNK_RETRY_INITIAL_DELAY_MS * (2 ** normalizedAttempt);
  return Math.min(APP_ROUTE_CHUNK_RETRY_MAX_DELAY_MS, delayMs);
}

export function shouldAutoRetryChunkLoadRoute(error: unknown, attempt: number): boolean {
  return isChunkLoadRouteError(error) && Math.max(0, Math.trunc(attempt)) < APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS;
}
