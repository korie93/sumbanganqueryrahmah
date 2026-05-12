const IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_LIMIT = 256;
const IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_TTL_MS = 5 * 60 * 1000;
const IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_SWEEP_INTERVAL_MS = 60 * 1000;

export type IdempotencyFingerprintValidationCacheEntry = {
  lastValidatedAt: number;
};

type IdempotencyFingerprintValidationCacheController = {
  cache: Map<string, IdempotencyFingerprintValidationCacheEntry>;
  clear: () => void;
  get: (key: string) => IdempotencyFingerprintValidationCacheEntry | undefined;
  set: (key: string, entry: IdempotencyFingerprintValidationCacheEntry) => void;
};

type CreateIdempotencyFingerprintValidationCacheControllerOptions = {
  clearIntervalFn?: typeof clearInterval;
  limit?: number;
  now?: () => number;
  setIntervalFn?: typeof setInterval;
  sweepIntervalMs?: number;
  ttlMs?: number;
};

export function pruneIdempotencyFingerprintValidationCache(
  cache: Map<string, IdempotencyFingerprintValidationCacheEntry>,
  limit = IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_LIMIT,
): number {
  if (cache.size <= limit) {
    return 0;
  }

  const pruneCount = cache.size - limit;
  let removed = 0;

  for (const key of cache.keys()) {
    cache.delete(key);
    removed += 1;
    if (removed >= pruneCount) {
      break;
    }
  }

  return removed;
}

export function pruneExpiredIdempotencyFingerprintValidationCache(
  cache: Map<string, IdempotencyFingerprintValidationCacheEntry>,
  options?: {
    now?: number;
    ttlMs?: number;
  },
): number {
  const now = options?.now ?? Date.now();
  const ttlMs = options?.ttlMs ?? IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_TTL_MS;
  let removed = 0;

  for (const [key, entry] of cache.entries()) {
    if (now - entry.lastValidatedAt < ttlMs) {
      continue;
    }

    cache.delete(key);
    removed += 1;
  }

  return removed;
}

export function createIdempotencyFingerprintValidationCacheController(
  options: CreateIdempotencyFingerprintValidationCacheControllerOptions = {},
): IdempotencyFingerprintValidationCacheController {
  const cache = new Map<string, IdempotencyFingerprintValidationCacheEntry>();
  const now = options.now ?? Date.now;
  const limit = options.limit ?? IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_LIMIT;
  const ttlMs = options.ttlMs ?? IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_TTL_MS;
  const sweepIntervalMs = options.sweepIntervalMs ?? IDEMPOTENCY_FINGERPRINT_PARSE_CACHE_SWEEP_INTERVAL_MS;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  let sweepHandle: ReturnType<typeof setInterval> | null = null;

  function stopSweepTimer() {
    if (!sweepHandle) {
      return;
    }

    clearIntervalFn(sweepHandle);
    sweepHandle = null;
  }

  function sweepExpiredEntries() {
    pruneExpiredIdempotencyFingerprintValidationCache(cache, {
      now: now(),
      ttlMs,
    });

    if (cache.size === 0) {
      stopSweepTimer();
    }
  }

  function ensureSweepTimer() {
    if (sweepHandle || cache.size === 0) {
      return;
    }

    sweepHandle = setIntervalFn(sweepExpiredEntries, sweepIntervalMs);
    sweepHandle.unref?.();
  }

  function clear() {
    cache.clear();
    stopSweepTimer();
  }

  function get(key: string) {
    const entry = cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (now() - entry.lastValidatedAt >= ttlMs) {
      cache.delete(key);
      if (cache.size === 0) {
        stopSweepTimer();
      }
      return undefined;
    }

    cache.delete(key);
    cache.set(key, entry);
    ensureSweepTimer();
    return entry;
  }

  function set(key: string, entry: IdempotencyFingerprintValidationCacheEntry) {
    pruneExpiredIdempotencyFingerprintValidationCache(cache, {
      now: now(),
      ttlMs,
    });

    cache.delete(key);
    cache.set(key, entry);
    pruneIdempotencyFingerprintValidationCache(cache, limit);
    ensureSweepTimer();
  }

  return {
    cache,
    clear,
    get,
    set,
  };
}
