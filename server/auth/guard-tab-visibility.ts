import type { IStorage } from "../storage-postgres";
import {
  TAB_VISIBILITY_CACHE_MAX_SIZE,
  TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS,
  TAB_VISIBILITY_CACHE_TTL_MS,
  evictOldestTabVisibilityCacheEntry,
  sweepExpiredTabVisibilityCacheEntries,
  type TabVisibilityCacheEntry,
} from "./guard-cache";

type TabVisibilityStorage = Pick<IStorage, "getRoleTabVisibility">;

export function createRoleTabVisibilityCache(options: {
  storage: TabVisibilityStorage;
}) {
  const storage = options.storage;
  const tabVisibilityCache = new Map<string, TabVisibilityCacheEntry>();
  let stopped = false;
  const sweepHandle = setInterval(() => {
    sweepExpiredTabVisibilityCacheEntries(tabVisibilityCache);
  }, TAB_VISIBILITY_CACHE_SWEEP_INTERVAL_MS);
  sweepHandle.unref?.();

  function setRoleTabVisibilityCache(role: string, tabs: Record<string, boolean>, cachedAt: number) {
    sweepExpiredTabVisibilityCacheEntries(tabVisibilityCache, cachedAt);

    if (!tabVisibilityCache.has(role)) {
      while (tabVisibilityCache.size >= TAB_VISIBILITY_CACHE_MAX_SIZE) {
        if (!evictOldestTabVisibilityCacheEntry(tabVisibilityCache)) {
          break;
        }
      }
    }

    tabVisibilityCache.set(role, { tabs, cachedAt });
  }

  return {
    clear() {
      tabVisibilityCache.clear();
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
