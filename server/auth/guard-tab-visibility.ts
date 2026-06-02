import type { IStorage } from "../storage-postgres";
import { internalMetrics } from "../internal/metrics";
import {
  TAB_VISIBILITY_CACHE_MAX_SIZE,
  TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS,
  TAB_VISIBILITY_CACHE_TTL_MS,
  createTabVisibilityLruCache,
  purgeStaleLruCacheEntries,
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
  const tabVisibilityCache = createTabVisibilityLruCache({
    onDispose: (_entry, _role, reason) => {
      if (reason === "evict") {
        internalMetrics.increment("authTabVisibilityCacheEvictionsTotal");
      }
      if (reason === "expire") {
        internalMetrics.increment("authTabVisibilityCacheExpiredEntriesTotal");
      }
    },
  });
  let stopped = false;

  function getStats(): TabVisibilityCacheStats {
    tabVisibilityCache.purgeStale();
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
    void now;
    const removed = purgeStaleLruCacheEntries(tabVisibilityCache);
    publishMetrics();
    return removed;
  }

  function setRoleTabVisibilityCache(role: string, tabs: Record<string, boolean>, cachedAt: number) {
    tabVisibilityCache.set(role, { tabs, cachedAt }, { start: cachedAt });
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
      publishMetrics();
    },
  };
}
