import { getCsrfHeader } from "./api/shared";
import { apiErrorPayloadSchema } from "@shared/api-contracts";
import {
  getHttpStatusErrorMessage,
  isGenericApiErrorMessage,
  UNKNOWN_API_ERROR_MESSAGE,
} from "@/constants/errorMessages";
import { notifyMaintenanceMode } from "./api/maintenance-navigation";
import {
  broadcastForcedLogout,
  setBannedSessionFlag,
  setStoredForcePasswordChange,
} from "./auth-session";
import { createClientRandomId } from "./secure-id";

const DEFAULT_API_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_API_MAX_RETRIES = 3;
const DEFAULT_API_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_API_RETRY_JITTER_RATIO = 0.1;
const DEFAULT_API_RETRY_MAX_DELAY_MS = 30_000;
const API_RETRY_CIRCUIT_FAILURE_THRESHOLD = 10;
const API_RETRY_CIRCUIT_WINDOW_MS = 60_000;
const API_RETRY_CIRCUIT_COOLDOWN_MS = 30_000;

const RETRYABLE_API_STATUS_CODES = new Set([429, 502, 503, 504]);
const responseRetryCounts = new WeakMap<Response, number>();

type ApiRetryOptions = false | {
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
  failureTimestamps: number[];
  openedUntilMs: number;
};

const apiRetryCircuitState: ApiRetryCircuitState = {
  failureTimestamps: [],
  openedUntilMs: 0,
};

export function createApiRequestId() {
  return createClientRandomId("api");
}

export function createApiHeaders(headers?: HeadersInit): Record<string, string> {
  const normalizedHeaders = new Headers(headers || undefined);
  const existingRequestId = String(normalizedHeaders.get("x-request-id") || "").trim();
  if (!existingRequestId) {
    normalizedHeaders.set("x-request-id", createApiRequestId());
  }

  return Object.fromEntries(normalizedHeaders.entries());
}

function looksLikeHtmlDocument(value: string) {
  return /<!doctype html|<html[\s>]|<body[\s>]|<head[\s>]/i.test(value);
}

function normalizePlainTextErrorMessage(res: Response, text: string) {
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();

  if (res.status === 413) {
    return "The selected file is too large to import. Try a smaller file or increase the server upload limit.";
  }

  if (looksLikeHtmlDocument(normalizedText)) {
    return `The server returned an unexpected ${res.status} error page.`;
  }

  if (!normalizedText) {
    return getHttpStatusErrorMessage(res.status);
  }

  if (isGenericApiErrorMessage(normalizedText)) {
    return getHttpStatusErrorMessage(res.status);
  }

  return normalizedText.length > 240
    ? `${normalizedText.slice(0, 237)}...`
    : normalizedText;
}

type ApiErrorPayload = Record<string, unknown> & {
  error?: unknown;
  message?: unknown;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(text: string): ApiErrorPayload | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isObjectRecord(parsed)) {
      return null;
    }

    const normalized = apiErrorPayloadSchema.safeParse(parsed);
    return normalized.success && isObjectRecord(normalized.data)
      ? normalized.data
      : { message: UNKNOWN_API_ERROR_MESSAGE };
  } catch {
    return null;
  }
}

function readApiMessage(payload: ApiErrorPayload | null): string {
  const nestedMessage = isObjectRecord(payload?.error) ? payload.error.message : undefined;
  if (typeof nestedMessage === "string" && nestedMessage.trim()) {
    return nestedMessage;
  }

  const message = payload?.message;
  return typeof message === "string" ? message : "";
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
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

function shouldSuppressApiRetries(nowMs = Date.now()) {
  if (apiRetryCircuitState.openedUntilMs <= 0) {
    return false;
  }

  if (apiRetryCircuitState.openedUntilMs > nowMs) {
    return true;
  }

  apiRetryCircuitState.openedUntilMs = 0;
  apiRetryCircuitState.failureTimestamps = [];
  return false;
}

function recordApiRetrySuccess() {
  apiRetryCircuitState.openedUntilMs = 0;
  apiRetryCircuitState.failureTimestamps = [];
}

function recordApiRetryFailure(nowMs = Date.now()) {
  pruneApiRetryCircuitFailures(nowMs);
  apiRetryCircuitState.failureTimestamps.push(nowMs);
  if (apiRetryCircuitState.failureTimestamps.length >= API_RETRY_CIRCUIT_FAILURE_THRESHOLD) {
    apiRetryCircuitState.openedUntilMs = nowMs + API_RETRY_CIRCUIT_COOLDOWN_MS;
  }
}

function attachApiRetryCount<T extends Error>(error: T, retryCount: number): T {
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
  apiRetryCircuitState.openedUntilMs = 0;
}

export async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const requestId = String(res.headers.get("x-request-id") || "").trim();
    const parsed = parseJsonObject(text);

    if (parsed?.banned) {
      setBannedSessionFlag(true);
    }

    if (parsed?.forcePasswordChange) {
      setStoredForcePasswordChange(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("force-password-change", {
            detail: parsed,
          }),
        );
      }
    }

    if (parsed?.forceLogout) {
      broadcastForcedLogout(readApiMessage(parsed));
    }

    if (res.status === 503) {
      if (parsed?.maintenance) {
        notifyMaintenanceMode(parsed);
      }
    }

    const errorMessage = readApiMessage(parsed) || normalizePlainTextErrorMessage(res, text);
    const normalizedPayload = parsed || { message: errorMessage };
    if (requestId && !normalizedPayload.requestId) {
      normalizedPayload.requestId = requestId;
    }
    throw attachApiRetryCount(
      new Error(`${res.status}: ${JSON.stringify(normalizedPayload)}`),
      getApiResponseRetryCount(res),
    );
  }
}

type ApiRequestOptions = {
  headers?: Record<string, string>;
  retry?: ApiRetryOptions | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | false | undefined;
};

type ApiFetchWithRetryOptions = {
  retry?: ApiRetryOptions | undefined;
};

function resolveApiRequestTimeoutMs(options?: ApiRequestOptions): number | null {
  if (options?.timeoutMs === false) {
    return null;
  }

  if (typeof options?.timeoutMs === "number" && Number.isFinite(options.timeoutMs)) {
    return Math.max(1, Math.trunc(options.timeoutMs));
  }

  // Preserve caller-owned AbortSignal identity when one is already provided.
  if (options?.signal) {
    return null;
  }

  return DEFAULT_API_REQUEST_TIMEOUT_MS;
}

function buildApiRequestTimeoutError(method: string, url: string, timeoutMs: number) {
  return new Error(`Request timed out after ${timeoutMs}ms: ${String(method || "GET").toUpperCase()} ${url}`);
}

function isNavigatorOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function buildOfflineApiRequestError() {
  return new Error("You appear to be offline. Check your internet connection and try again.");
}

function isLikelyOfflineFetchFailure(error: unknown) {
  if (!isNavigatorOffline()) {
    return false;
  }

  if (error instanceof TypeError) {
    return true;
  }

  return error instanceof Error
    && /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
}

function createApiRequestSignal(options?: ApiRequestOptions): {
  cleanup: () => void;
  signal?: AbortSignal | undefined;
  timedOut: () => boolean;
  timeoutMs: number | null;
} {
  const timeoutMs = resolveApiRequestTimeoutMs(options);
  if (!timeoutMs) {
    return {
      cleanup: () => {},
      signal: options?.signal,
      timedOut: () => false,
      timeoutMs: null,
    };
  }

  const controller = new AbortController();
  const callerSignal = options?.signal;
  let timeoutTriggered = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, timeoutMs);
  const handleCallerAbort = () => {
    controller.abort();
  };

  if (callerSignal?.aborted) {
    controller.abort();
  } else if (callerSignal) {
    callerSignal.addEventListener("abort", handleCallerAbort, { once: true });
  }

  return {
    cleanup: () => {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      callerSignal?.removeEventListener("abort", handleCallerAbort);
    },
    signal: controller.signal,
    timedOut: () => timeoutTriggered,
    timeoutMs,
  };
}

export async function fetchApiWithRetry(
  input: string | URL | Request,
  init?: RequestInit | undefined,
  options?: ApiFetchWithRetryOptions | undefined,
): Promise<Response> {
  const retryOptions = resolveApiRetryOptions(options?.retry);
  const maxRetries = shouldSuppressApiRetries() ? 0 : retryOptions.maxRetries;
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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: ApiRequestOptions,
): Promise<Response> {
  if (isNavigatorOffline()) {
    throw buildOfflineApiRequestError();
  }

  const isFormDataPayload =
    typeof FormData !== "undefined"
    && data instanceof FormData;
  const headers = createApiHeaders({
    ...(String(method || "").toUpperCase() === "GET"
      || String(method || "").toUpperCase() === "HEAD"
      || String(method || "").toUpperCase() === "OPTIONS"
      ? {}
      : (getCsrfHeader() as Record<string, string>)),
    ...(options?.headers || {}),
  });
  if (data && !isFormDataPayload) headers["Content-Type"] = "application/json";

  const requestInit: RequestInit = {
    method,
    headers,
    credentials: "include",
  };
  if (data) {
    requestInit.body = isFormDataPayload ? data as FormData : JSON.stringify(data);
  }
  const requestSignal = createApiRequestSignal(options);
  if (requestSignal.signal) {
    requestInit.signal = requestSignal.signal;
  }

  try {
    const res = await fetchApiWithRetry(url, requestInit, {
      retry: options?.retry,
    });

    try {
      await throwIfResNotOk(res);
    } catch (error) {
      if (error instanceof Error) {
        throw attachApiRetryCount(error, getApiResponseRetryCount(res));
      }
      throw error;
    }
    return res;
  } catch (error) {
    if (
      requestSignal.timeoutMs
      && requestSignal.timedOut()
      && isAbortError(error)
    ) {
      throw buildApiRequestTimeoutError(method, url, requestSignal.timeoutMs);
    }
    if (isLikelyOfflineFetchFailure(error)) {
      throw buildOfflineApiRequestError();
    }
    throw error;
  } finally {
    requestSignal.cleanup();
  }
}
