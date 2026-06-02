import { LRUCache } from "lru-cache";

export type TabVisibilityCacheEntry = {
  tabs: Record<string, boolean>;
  cachedAt: number;
};

export const TAB_VISIBILITY_CACHE_TTL_MS = 5 * 60 * 1000;
export const TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS = 0;
export const TAB_VISIBILITY_CACHE_MAX_SIZE = 100;
export const TAB_VISIBILITY_CACHE_TARGET_SIZE_AFTER_EVICTION = Math.floor(
  TAB_VISIBILITY_CACHE_MAX_SIZE * 0.8,
);
export const ACTIVITY_UPDATE_THROTTLE_MS = 30 * 1000;
export const ACTIVITY_UPDATE_CACHE_TTL_MS = 2 * 60 * 1000;
export const ACTIVITY_UPDATE_CACHE_SWEEP_INTERVAL_MS = 0;
export const ACTIVITY_UPDATE_CACHE_MAX_SIZE = 5_000;
export const ACTIVITY_UPDATE_CACHE_PREEMPTIVE_EVICTION_THRESHOLD = Math.floor(
  ACTIVITY_UPDATE_CACHE_MAX_SIZE * 0.9,
);
export const ACTIVITY_UPDATE_CACHE_TARGET_SIZE_AFTER_EVICTION = Math.floor(
  ACTIVITY_UPDATE_CACHE_MAX_SIZE * 0.8,
);

type GuardCacheDisposeHandler<T extends {}> = (entry: T, key: string, reason: LRUCache.DisposeReason) => void;

type GuardCacheOptions<T extends {}> = {
  maxSize: number;
  ttlMs: number;
  onDispose?: GuardCacheDisposeHandler<T> | undefined;
};

export type TabVisibilityLruCache = LRUCache<string, TabVisibilityCacheEntry>;
export type ActivityUpdateLruCache = LRUCache<string, number>;

function normalizeCacheLimit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(value));
}

function createGuardLruCache<T extends {}>(options: GuardCacheOptions<T>): LRUCache<string, T> {
  return new LRUCache<string, T>({
    max: normalizeCacheLimit(options.maxSize, 1),
    ttl: normalizeCacheLimit(options.ttlMs, 1),
    ttlAutopurge: false,
    ttlResolution: 0,
    updateAgeOnGet: false,
    updateAgeOnHas: false,
    allowStale: false,
    perf: {
      now: () => Date.now(),
    },
    ...(options.onDispose ? { dispose: options.onDispose } : {}),
  });
}

export function createTabVisibilityLruCache(options?: {
  maxSize?: number | undefined;
  ttlMs?: number | undefined;
  onDispose?: GuardCacheDisposeHandler<TabVisibilityCacheEntry> | undefined;
}): TabVisibilityLruCache {
  return createGuardLruCache<TabVisibilityCacheEntry>({
    maxSize: options?.maxSize ?? TAB_VISIBILITY_CACHE_MAX_SIZE,
    ttlMs: options?.ttlMs ?? TAB_VISIBILITY_CACHE_TTL_MS,
    onDispose: options?.onDispose,
  });
}

export function createActivityUpdateLruCache(options?: {
  maxSize?: number | undefined;
  ttlMs?: number | undefined;
  onDispose?: GuardCacheDisposeHandler<number> | undefined;
}): ActivityUpdateLruCache {
  return createGuardLruCache<number>({
    maxSize: options?.maxSize ?? ACTIVITY_UPDATE_CACHE_MAX_SIZE,
    ttlMs: options?.ttlMs ?? ACTIVITY_UPDATE_CACHE_TTL_MS,
    onDispose: options?.onDispose,
  });
}

export function purgeStaleLruCacheEntries<T extends {}>(cache: LRUCache<string, T>): number {
  const sizeBefore = cache.size;
  cache.purgeStale();
  return Math.max(0, sizeBefore - cache.size);
}

function getOldestMapEntryKey<T>(
  cache: Map<string, T>,
  readTimestamp: (entry: T) => number,
): string | null {
  let oldestKey: string | null = null;
  let oldestTimestamp = Number.POSITIVE_INFINITY;

  for (const [key, entry] of cache.entries()) {
    const timestamp = readTimestamp(entry);
    if (timestamp < oldestTimestamp) {
      oldestTimestamp = timestamp;
      oldestKey = key;
    }
  }

  return oldestKey;
}

function evictOldestMapEntries<T>(
  cache: Map<string, T>,
  readTimestamp: (entry: T) => number,
  count: number,
): string[] {
  const normalizedCount = Math.max(0, Math.trunc(count));
  const evictedKeys: string[] = [];

  for (let index = 0; index < normalizedCount && cache.size > 0; index += 1) {
    const key = getOldestMapEntryKey(cache, readTimestamp);
    if (key === null) {
      break;
    }
    cache.delete(key);
    evictedKeys.push(key);
  }

  return evictedKeys;
}

export function evictOldestTabVisibilityCacheEntry(
  cache: Map<string, TabVisibilityCacheEntry>,
): string | null {
  return evictOldestMapEntries(cache, (entry) => entry.cachedAt, 1)[0] ?? null;
}

export function evictOldestTabVisibilityCacheEntries(
  cache: Map<string, TabVisibilityCacheEntry>,
  targetSize = TAB_VISIBILITY_CACHE_TARGET_SIZE_AFTER_EVICTION,
): string[] {
  return evictOldestMapEntries(
    cache,
    (entry) => entry.cachedAt,
    cache.size - Math.max(0, Math.trunc(targetSize)),
  );
}

export function sweepExpiredTabVisibilityCacheEntries(
  cache: Map<string, TabVisibilityCacheEntry>,
  now = Date.now(),
): number {
  let removed = 0;
  for (const [key, entry] of cache.entries()) {
    if (now - entry.cachedAt >= TAB_VISIBILITY_CACHE_TTL_MS) {
      cache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function evictOldestActivityUpdateCacheEntry(cache: Map<string, number>): string | null {
  return evictOldestMapEntries(cache, (updatedAt) => updatedAt, 1)[0] ?? null;
}

export function evictOldestActivityUpdateCacheEntries(
  cache: Map<string, number>,
  targetSize = ACTIVITY_UPDATE_CACHE_TARGET_SIZE_AFTER_EVICTION,
): string[] {
  return evictOldestMapEntries(
    cache,
    (updatedAt) => updatedAt,
    cache.size - Math.max(0, Math.trunc(targetSize)),
  );
}

export function sweepExpiredActivityUpdateCacheEntries(
  cache: Map<string, number>,
  now = Date.now(),
): number {
  let removed = 0;
  for (const [key, updatedAt] of cache.entries()) {
    if (now - updatedAt >= ACTIVITY_UPDATE_CACHE_TTL_MS) {
      cache.delete(key);
      removed += 1;
    }
  }
  return removed;
}
