import type { IStorage } from "../storage-postgres";
import {
  ACTIVITY_UPDATE_CACHE_MAX_SIZE,
  ACTIVITY_UPDATE_CACHE_SWEEP_INTERVAL_MS,
  ACTIVITY_UPDATE_THROTTLE_MS,
  evictOldestActivityUpdateCacheEntry,
  sweepExpiredActivityUpdateCacheEntries,
} from "./guard-cache";

type ActivityUpdateStorage = Pick<IStorage, "updateActivity">;

export function createActivityUpdateThrottler(options: {
  activityUpdateThrottleMs?: number | undefined;
  storage: ActivityUpdateStorage;
}) {
  const storage = options.storage;
  const activityUpdateThrottleMs = Math.max(0, options.activityUpdateThrottleMs ?? ACTIVITY_UPDATE_THROTTLE_MS);
  const activityUpdateCache = new Map<string, number>();
  let stopped = false;
  const sweepHandle = setInterval(() => {
    sweepExpiredActivityUpdateCacheEntries(activityUpdateCache);
  }, ACTIVITY_UPDATE_CACHE_SWEEP_INTERVAL_MS);
  sweepHandle.unref?.();

  function reserveActivityUpdate(activityId: string, now: number) {
    if (activityUpdateThrottleMs <= 0) {
      return true;
    }

    sweepExpiredActivityUpdateCacheEntries(activityUpdateCache, now);
    const lastUpdatedAt = activityUpdateCache.get(activityId);
    if (lastUpdatedAt !== undefined && now - lastUpdatedAt < activityUpdateThrottleMs) {
      return false;
    }

    if (!activityUpdateCache.has(activityId)) {
      while (activityUpdateCache.size >= ACTIVITY_UPDATE_CACHE_MAX_SIZE) {
        if (!evictOldestActivityUpdateCacheEntry(activityUpdateCache)) {
          break;
        }
      }
    }

    activityUpdateCache.set(activityId, now);
    return true;
  }

  function releaseFailedActivityUpdateReservation(activityId: string, reservedAt: number) {
    if (activityUpdateThrottleMs > 0 && activityUpdateCache.get(activityId) === reservedAt) {
      activityUpdateCache.delete(activityId);
    }
  }

  return {
    clear() {
      activityUpdateCache.clear();
    },
    async updateAuthenticatedActivity(activityId: string) {
      const now = Date.now();
      if (!reserveActivityUpdate(activityId, now)) {
        return;
      }

      try {
        await storage.updateActivity(activityId, {
          lastActivityTime: new Date(now),
        });
      } catch (error) {
        releaseFailedActivityUpdateReservation(activityId, now);
        throw error;
      }
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
