const DEFAULT_API_MAX_RETRIES = 3;
const DEFAULT_API_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_API_RETRY_JITTER_RATIO = 0.1;
const DEFAULT_API_RETRY_MAX_DELAY_MS = 30_000;
const API_RETRY_CIRCUIT_FAILURE_THRESHOLD = 5;
const API_RETRY_CIRCUIT_SUCCESS_THRESHOLD = 2;
const API_RETRY_CIRCUIT_WINDOW_MS = 30_000;
const API_RETRY_CIRCUIT_COOLDOWN_MS = 30_000;

const RETRYABLE_API_STATUS_CODES = new Set([429, 502, 503, 504]);
const responseRetryCounts = new WeakMap<Response, number>();

export type ApiRetryOptions = false | {
  baseDelayMs?: number | undefined;
  jitterRatio?: number | undefined;
  maxDelayMs?: number | undefined;
  maxRetries?: number | undefined;
};

type ResolvedApiRetryOptions = {
  baseDelayMs: number;
  jitterRatio: number;
  maxDelayMs: number;
  maxRetries: number;
};

type ApiRetryCircuitState = {
  halfOpenSuccesses: number;
  failureTimestamps: number[];
  openedUntilMs: number;
  phase: "CLOSED" | "OPEN" | "HALF_OPEN";
};

export type ApiRetryCircuitSnapshot = {
  failureCount: number;
  halfOpenSuccesses: number;
  openedUntilMs: number;
  phase: ApiRetryCircuitState["phase"];
};

type ApiFetchWithRetryOptions = {
  retry?: ApiRetryOptions | undefined;
};

const apiRetryCircuitState: ApiRetryCircuitState = {
  halfOpenSuccesses: 0,
  failureTimestamps: [],
  openedUntilMs: 0,
  phase: "CLOSED",
};

export class ApiCircuitOpenError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`API retry circuit is open. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`);
    this.name = "ApiCircuitOpenError";
    this.retryAfterMs = Math.max(0, Math.trunc(retryAfterMs));
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function clampRatio(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

function resolveApiRetryOptions(options?: ApiRetryOptions): ResolvedApiRetryOptions {
  if (options === false) {
    return {
      baseDelayMs: DEFAULT_API_RETRY_BASE_DELAY_MS,
      jitterRatio: 0,
      maxDelayMs: DEFAULT_API_RETRY_MAX_DELAY_MS,
      maxRetries: 0,
    };
  }

  return {
    baseDelayMs: clampInteger(options?.baseDelayMs, DEFAULT_API_RETRY_BASE_DELAY_MS, 0, 60_000),
    jitterRatio: clampRatio(options?.jitterRatio, DEFAULT_API_RETRY_JITTER_RATIO),
    maxDelayMs: clampInteger(options?.maxDelayMs, DEFAULT_API_RETRY_MAX_DELAY_MS, 1, 120_000),
    maxRetries: clampInteger(options?.maxRetries, DEFAULT_API_MAX_RETRIES, 0, 5),
  };
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function isNavigatorOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isRetryableApiStatus(status: number) {
  return RETRYABLE_API_STATUS_CODES.has(status);
}

function isRetryableFetchError(error: unknown) {
  if (isAbortError(error) || isNavigatorOffline()) {
    return false;
  }

  if (error instanceof TypeError) {
    return true;
  }

  return error instanceof Error
    && /failed to fetch|networkerror|load failed|network request failed|econnreset|etimedout/i.test(error.message);
}

function normalizeRetryAfterMs(value: string | null) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.trunc(seconds * 1_000);
  }

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) {
    return null;
  }

  return Math.max(0, dateMs - Date.now());
}

function resolveApiRetryDelayMs(
  retryIndex: number,
  retryOptions: ResolvedApiRetryOptions,
  response?: Response | undefined,
) {
  const retryAfterMs = normalizeRetryAfterMs(response?.headers.get("retry-after") || null);
  const exponentialDelayMs = retryOptions.baseDelayMs * (2 ** retryIndex);
  const boundedDelayMs = Math.min(retryOptions.maxDelayMs, retryAfterMs ?? exponentialDelayMs);
  if (!retryOptions.jitterRatio || boundedDelayMs <= 0) {
    return boundedDelayMs;
  }

  const jitterRangeMs = boundedDelayMs * retryOptions.jitterRatio;
  const jitterMs = (Math.random() * 2 - 1) * jitterRangeMs;
  return Math.max(0, Math.round(boundedDelayMs + jitterMs));
}

function waitForApiRetryDelay(delayMs: number, signal?: AbortSignal | undefined) {
  if (delayMs <= 0) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    timeoutHandle = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function pruneApiRetryCircuitFailures(nowMs: number) {
  const cutoffMs = nowMs - API_RETRY_CIRCUIT_WINDOW_MS;
  while (
    apiRetryCircuitState.failureTimestamps.length > 0
    && apiRetryCircuitState.failureTimestamps[0] < cutoffMs
  ) {
    apiRetryCircuitState.failureTimestamps.shift();
  }
}

function openApiRetryCircuit(nowMs: number) {
  apiRetryCircuitState.phase = "OPEN";
  apiRetryCircuitState.openedUntilMs = nowMs + API_RETRY_CIRCUIT_COOLDOWN_MS;
  apiRetryCircuitState.halfOpenSuccesses = 0;
}

function closeApiRetryCircuit() {
  apiRetryCircuitState.phase = "CLOSED";
  apiRetryCircuitState.openedUntilMs = 0;
  apiRetryCircuitState.halfOpenSuccesses = 0;
  apiRetryCircuitState.failureTimestamps = [];
}

function refreshApiRetryCircuitPhase(nowMs = Date.now()) {
  if (
    apiRetryCircuitState.phase === "OPEN"
    && apiRetryCircuitState.openedUntilMs > 0
    && apiRetryCircuitState.openedUntilMs <= nowMs
  ) {
    apiRetryCircuitState.phase = "HALF_OPEN";
    apiRetryCircuitState.openedUntilMs = 0;
    apiRetryCircuitState.halfOpenSuccesses = 0;
    apiRetryCircuitState.failureTimestamps = [];
  }

  return apiRetryCircuitState.phase;
}

function recordApiRetrySuccess() {
  const phase = refreshApiRetryCircuitPhase();
  if (phase === "HALF_OPEN") {
    apiRetryCircuitState.halfOpenSuccesses += 1;
    if (apiRetryCircuitState.halfOpenSuccesses >= API_RETRY_CIRCUIT_SUCCESS_THRESHOLD) {
      closeApiRetryCircuit();
    }
    return;
  }

  if (phase === "CLOSED") {
    apiRetryCircuitState.failureTimestamps = [];
  }
}

function recordApiRetryFailure(nowMs = Date.now()) {
  const phase = refreshApiRetryCircuitPhase(nowMs);
  if (phase === "HALF_OPEN") {
    openApiRetryCircuit(nowMs);
    return;
  }

  pruneApiRetryCircuitFailures(nowMs);
  apiRetryCircuitState.failureTimestamps.push(nowMs);
  if (apiRetryCircuitState.failureTimestamps.length >= API_RETRY_CIRCUIT_FAILURE_THRESHOLD) {
    openApiRetryCircuit(nowMs);
  }
}

function resolveApiRetryCircuitAccess(retryOptions: ResolvedApiRetryOptions, nowMs = Date.now()) {
  const phase = refreshApiRetryCircuitPhase(nowMs);
  if (phase === "OPEN" && retryOptions.maxRetries > 0) {
    throw new ApiCircuitOpenError(apiRetryCircuitState.openedUntilMs - nowMs);
  }

  return {
    maxRetries: phase === "HALF_OPEN" ? 0 : retryOptions.maxRetries,
    phase,
  };
}

export function attachApiRetryCount<T extends Error>(error: T, retryCount: number): T {
  Object.defineProperty(error, "retryCount", {
    configurable: true,
    enumerable: true,
    value: Math.max(0, Math.trunc(retryCount)),
    writable: true,
  });
  return error;
}

export function getApiErrorRetryCount(error: unknown) {
  if (!isObjectRecord(error)) {
    return 0;
  }

  const retryCount = Number(error.retryCount);
  return Number.isFinite(retryCount) ? Math.max(0, Math.trunc(retryCount)) : 0;
}

export function getApiResponseRetryCount(response: Response) {
  return responseRetryCounts.get(response) || 0;
}

export function resetApiRetryStateForTests() {
  apiRetryCircuitState.failureTimestamps = [];
  apiRetryCircuitState.halfOpenSuccesses = 0;
  apiRetryCircuitState.openedUntilMs = 0;
  apiRetryCircuitState.phase = "CLOSED";
}

export function getApiRetryCircuitSnapshot(): ApiRetryCircuitSnapshot {
  refreshApiRetryCircuitPhase();
  return {
    failureCount: apiRetryCircuitState.failureTimestamps.length,
    halfOpenSuccesses: apiRetryCircuitState.halfOpenSuccesses,
    openedUntilMs: apiRetryCircuitState.openedUntilMs,
    phase: apiRetryCircuitState.phase,
  };
}

export function getApiRetryCircuitSnapshotForTests() {
  return getApiRetryCircuitSnapshot();
}

export async function fetchApiWithRetry(
  input: string | URL | Request,
  init?: RequestInit | undefined,
  options?: ApiFetchWithRetryOptions | undefined,
): Promise<Response> {
  const retryOptions = resolveApiRetryOptions(options?.retry);
  const circuitAccess = resolveApiRetryCircuitAccess(retryOptions);
  const maxRetries = circuitAccess.maxRetries;
  const signal = init?.signal as AbortSignal | undefined;
  let retryCount = 0;

  for (;;) {
    try {
      const response = await fetch(input, init);
      responseRetryCounts.set(response, retryCount);

      if (!response.ok && isRetryableApiStatus(response.status) && retryCount < maxRetries) {
        const delayMs = resolveApiRetryDelayMs(retryCount, retryOptions, response);
        retryCount += 1;
        await waitForApiRetryDelay(delayMs, signal);
        continue;
      }

      if (response.ok) {
        recordApiRetrySuccess();
      } else if (isRetryableApiStatus(response.status)) {
        recordApiRetryFailure();
      }

      responseRetryCounts.set(response, retryCount);
      return response;
    } catch (error) {
      if (!isRetryableFetchError(error) || retryCount >= maxRetries) {
        if (isRetryableFetchError(error)) {
          recordApiRetryFailure();
        }
        if (error instanceof Error) {
          throw attachApiRetryCount(error, retryCount);
        }
        throw error;
      }

      const delayMs = resolveApiRetryDelayMs(retryCount, retryOptions);
      retryCount += 1;
      await waitForApiRetryDelay(delayMs, signal);
    }
  }
}
