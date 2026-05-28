import type { IStorage } from "../storage-postgres";
import { internalMetrics } from "../internal/metrics";
import {
  TAB_VISIBILITY_CACHE_MAX_SIZE,
  TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS,
  TAB_VISIBILITY_CACHE_TTL_MS,
  evictOldestTabVisibilityCacheEntry,
  sweepExpiredTabVisibilityCacheEntries,
  type TabVisibilityCacheEntry,
} from "./guard-cache";

type TabVisibilityStorage = Pick<IStorage, "getRoleTabVisibility">;

export type TabVisibilityCacheStats = {
  size: number;
  maxSize: number;
  ttlMs: number;
  sweepIntervalMs: number;
  utilization: number;
};

export function createRoleTabVisibilityCache(options: {
  storage: TabVisibilityStorage;
}) {
  const storage = options.storage;
  const tabVisibilityCache = new Map<string, TabVisibilityCacheEntry>();
  let stopped = false;
  const sweepHandle = setInterval(() => {
    sweepExpiredEntries();
  }, TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS);
  sweepHandle.unref?.();

  function getStats(): TabVisibilityCacheStats {
    return {
      size: tabVisibilityCache.size,
      maxSize: TAB_VISIBILITY_CACHE_MAX_SIZE,
      ttlMs: TAB_VISIBILITY_CACHE_TTL_MS,
      sweepIntervalMs: TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS,
      utilization: tabVisibilityCache.size / TAB_VISIBILITY_CACHE_MAX_SIZE,
    };
  }

  function publishMetrics(): void {
    const stats = getStats();
    internalMetrics.gauge("authTabVisibilityCacheSize", stats.size);
    internalMetrics.gauge("authTabVisibilityCacheUtilization", stats.utilization);
  }

  function sweepExpiredEntries(now = Date.now()): number {
    const removed = sweepExpiredTabVisibilityCacheEntries(tabVisibilityCache, now);
    if (removed > 0) {
      internalMetrics.increment("authTabVisibilityCacheExpiredEntriesTotal", removed);
    }
    publishMetrics();
    return removed;
  }

  function setRoleTabVisibilityCache(role: string, tabs: Record<string, boolean>, cachedAt: number) {
    sweepExpiredEntries(cachedAt);

    if (!tabVisibilityCache.has(role)) {
      let evicted = 0;
      while (tabVisibilityCache.size >= TAB_VISIBILITY_CACHE_MAX_SIZE) {
        if (!evictOldestTabVisibilityCacheEntry(tabVisibilityCache)) {
          break;
        }
        evicted += 1;
      }
      if (evicted > 0) {
        internalMetrics.increment("authTabVisibilityCacheEvictionsTotal", evicted);
      }
    }

    tabVisibilityCache.set(role, { tabs, cachedAt });
    publishMetrics();
  }

  return {
    clear() {
      tabVisibilityCache.clear();
      publishMetrics();
    },
    getStats,
    sweepExpiredForTests(now = Date.now()) {
      return sweepExpiredEntries(now);
    },
    async getRoleTabVisibilityCached(role: string): Promise<Record<string, boolean>> {
      if (role === "superuser") return {};
      const now = Date.now();
      const cached = tabVisibilityCache.get(role);
      if (cached) {
        if (now - cached.cachedAt < TAB_VISIBILITY_CACHE_TTL_MS) {
          return cached.tabs;
        }

        tabVisibilityCache.delete(role);
        internalMetrics.increment("authTabVisibilityCacheExpiredEntriesTotal");
        publishMetrics();
      }

      const tabs = await storage.getRoleTabVisibility(role);
      setRoleTabVisibilityCache(role, tabs, now);
      return tabs;
    },
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      clearInterval(sweepHandle);
    },
  };
}
