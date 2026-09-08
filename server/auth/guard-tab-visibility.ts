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
  let generation = 0;
  const roleGenerations = new Map<string, number>();

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
    clear(role?: string) {
      if (role) {
        roleGenerations.set(role, (roleGenerations.get(role) ?? 0) + 1);
        tabVisibilityCache.delete(role);
      } else {
        generation += 1;
        roleGenerations.clear();
        tabVisibilityCache.clear();
      }
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

      // A read begun before a settings save must not repopulate the cache with
      // the old permission after the save has invalidated it.
      for (;;) {
        const readGeneration = generation;
        const readRoleGeneration = roleGenerations.get(role) ?? 0;
        const tabs = await storage.getRoleTabVisibility(role);
        if (readGeneration !== generation || readRoleGeneration !== (roleGenerations.get(role) ?? 0)) continue;
        setRoleTabVisibilityCache(role, tabs, Date.now());
        return tabs;
      }
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
