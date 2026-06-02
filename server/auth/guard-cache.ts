export type TabVisibilityCacheEntry = {
  tabs: Record<string, boolean>;
  cachedAt: number;
};

export const TAB_VISIBILITY_CACHE_TTL_MS = 5 * 60 * 1000;
export const TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS = TAB_VISIBILITY_CACHE_TTL_MS;
export const TAB_VISIBILITY_CACHE_MAX_SIZE = 100;
export const TAB_VISIBILITY_CACHE_TARGET_SIZE_AFTER_EVICTION = Math.floor(
  TAB_VISIBILITY_CACHE_MAX_SIZE * 0.8,
);
export const ACTIVITY_UPDATE_THROTTLE_MS = 30 * 1000;
export const ACTIVITY_UPDATE_CACHE_TTL_MS = 2 * 60 * 1000;
export const ACTIVITY_UPDATE_CACHE_SWEEP_INTERVAL_MS = ACTIVITY_UPDATE_CACHE_TTL_MS;
export const ACTIVITY_UPDATE_CACHE_MAX_SIZE = 5_000;
export const ACTIVITY_UPDATE_CACHE_PREEMPTIVE_EVICTION_THRESHOLD = Math.floor(
  ACTIVITY_UPDATE_CACHE_MAX_SIZE * 0.9,
);
export const ACTIVITY_UPDATE_CACHE_TARGET_SIZE_AFTER_EVICTION = Math.floor(
  ACTIVITY_UPDATE_CACHE_MAX_SIZE * 0.8,
);

function evictOldestEntries<T>(
  cache: Map<string, T>,
  readTimestamp: (entry: T) => number,
  count: number,
): string[] {
  const normalizedCount = Math.max(0, Math.trunc(count));
  if (normalizedCount === 0 || cache.size === 0) {
    return [];
  }

  const keysToEvict = Array.from(cache.entries())
    .sort(([, left], [, right]) => readTimestamp(left) - readTimestamp(right))
    .slice(0, normalizedCount)
    .map(([key]) => key);

  for (const key of keysToEvict) {
    cache.delete(key);
  }

  return keysToEvict;
}

export function evictOldestTabVisibilityCacheEntry(
  cache: Map<string, TabVisibilityCacheEntry>,
): string | null {
  return evictOldestEntries(cache, (entry) => entry.cachedAt, 1)[0] ?? null;
}

export function evictOldestTabVisibilityCacheEntries(
  cache: Map<string, TabVisibilityCacheEntry>,
  targetSize = TAB_VISIBILITY_CACHE_TARGET_SIZE_AFTER_EVICTION,
): string[] {
  return evictOldestEntries(
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
  return evictOldestEntries(cache, (updatedAt) => updatedAt, 1)[0] ?? null;
}

export function evictOldestActivityUpdateCacheEntries(
  cache: Map<string, number>,
  targetSize = ACTIVITY_UPDATE_CACHE_TARGET_SIZE_AFTER_EVICTION,
): string[] {
  return evictOldestEntries(
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
