export type TabVisibilityCacheEntry = {
  tabs: Record<string, boolean>;
  cachedAt: number;
};

export const TAB_VISIBILITY_CACHE_TTL_MS = 5 * 60 * 1000;
export const TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS = TAB_VISIBILITY_CACHE_TTL_MS;
export const TAB_VISIBILITY_CACHE_MAX_SIZE = 100;
export const ACTIVITY_UPDATE_THROTTLE_MS = 30 * 1000;
export const ACTIVITY_UPDATE_CACHE_TTL_MS = 2 * 60 * 1000;
export const ACTIVITY_UPDATE_CACHE_SWEEP_INTERVAL_MS = ACTIVITY_UPDATE_CACHE_TTL_MS;
export const ACTIVITY_UPDATE_CACHE_MAX_SIZE = 5_000;

export function evictOldestTabVisibilityCacheEntry(
  cache: Map<string, TabVisibilityCacheEntry>,
): string | null {
  let oldestKey: string | null = null;
  let oldestCachedAt = Number.POSITIVE_INFINITY;

  for (const [key, entry] of cache.entries()) {
    if (entry.cachedAt < oldestCachedAt) {
      oldestCachedAt = entry.cachedAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    cache.delete(oldestKey);
  }

  return oldestKey;
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
  let oldestKey: string | null = null;
  let oldestUpdatedAt = Number.POSITIVE_INFINITY;

  for (const [key, updatedAt] of cache.entries()) {
    if (updatedAt < oldestUpdatedAt) {
      oldestUpdatedAt = updatedAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    cache.delete(oldestKey);
  }

  return oldestKey;
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
