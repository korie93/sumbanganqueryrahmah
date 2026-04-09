import { CircuitOpenError } from "../internal/circuitBreaker";
import type {
  AiSearchCandidateRow,
  AiSearchResponse,
  AiSearchResult,
  SearchCacheEntry,
} from "./ai-search-types";

export function trimTimedCacheEntries<T extends { ts: number }>(
  cache: Map<string, T>,
  maxEntries: number,
) {
  if (cache.size <= maxEntries) return;
  const excess = cache.size - maxEntries;
  const keysByAge = Array.from(cache.entries())
    .sort((a, b) => a[1].ts - b[1].ts)
    .slice(0, excess)
    .map(([key]) => key);

  for (const key of keysByAge) {
    cache.delete(key);
  }
}

export function sweepTimedCacheEntries<T extends { ts: number }>(
  cache: Map<string, T>,
  maxAgeMs: number,
  maxEntries: number,
  now = Date.now(),
) {
  for (const [key, entry] of cache.entries()) {
    if (now - entry.ts >= maxAgeMs) {
      cache.delete(key);
    }
  }

  trimTimedCacheEntries(cache, maxEntries);
}

export function getFreshTimedCacheEntry<T extends { ts: number }>(
  cache: Map<string, T>,
  key: string,
  maxAgeMs: number,
  now = Date.now(),
): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (now - entry.ts >= maxAgeMs) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function getFreshLastAiPerson(
  cache: Map<string, { ts: number; row: AiSearchCandidateRow }>,
  key: string,
  ttlMs: number,
  now = Date.now(),
): AiSearchCandidateRow | null {
  const entry = getFreshTimedCacheEntry(cache, key, ttlMs, now);
  return entry?.row || null;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), ms);
    promise
      .then((value) => {
        clearTimeout(id);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(id);
        reject(error);
      });
  });
}

export function resolveAiSearchRequestTimeoutMs(configuredTimeoutMs: number): number {
  const normalizedTimeoutMs = Math.max(1000, Math.floor(configuredTimeoutMs));
  const processingBufferMs = Math.max(
    1500,
    Math.min(3000, Math.floor(normalizedTimeoutMs * 0.3)),
  );
  return normalizedTimeoutMs + processingBufferMs;
}

export function getOrCreateAiSearchInflight(params: {
  cacheKey: string;
  inflight: Map<string, Promise<AiSearchResult>>;
  cache: Map<string, SearchCacheEntry>;
  compute: () => Promise<AiSearchResult>;
  maxCacheEntries: number;
  now?: () => number;
}) {
  const now = params.now ?? Date.now;
  const existing = params.inflight.get(params.cacheKey);
  if (existing) {
    return existing;
  }

  const created = params
    .compute()
    .then((result) => {
      params.cache.set(params.cacheKey, {
        ts: now(),
        payload: result.payload,
        audit: result.audit,
      });
      trimTimedCacheEntries(params.cache, params.maxCacheEntries);
      params.inflight.delete(params.cacheKey);
      return result;
    })
    .catch((error) => {
      params.inflight.delete(params.cacheKey);
      throw error;
    });

  params.inflight.set(params.cacheKey, created);
  return created;
}

export function buildAiSearchResolveErrorResponse(error: unknown): AiSearchResponse {
  if (error instanceof CircuitOpenError) {
    return {
      statusCode: 503,
      body: {
        person: null,
        nearest_branch: null,
        decision: null,
        ai_explanation:
          "AI service is temporarily throttled for system stability. Please retry in a few seconds.",
        processing: false,
        circuit: "OPEN",
      },
    };
  }

  return {
    statusCode: 200,
    body: {
      person: null,
      nearest_branch: null,
      decision: null,
      ai_explanation: "Sedang proses carian. Sila tunggu beberapa saat dan cuba semula.",
      processing: true,
    },
  };
}

export function shouldLogAiSearchResolveError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error ?? "");
  return Boolean(errorMessage && errorMessage !== "timeout" && !(error instanceof CircuitOpenError));
}
