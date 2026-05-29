import { createHash } from "node:crypto";
import type { IStorage } from "../storage-postgres";
import type { UserActivity } from "../../shared/schema-postgres";
import { logger } from "../lib/logger";
import {
  ACTIVITY_UPDATE_CACHE_MAX_SIZE,
  ACTIVITY_UPDATE_CACHE_SWEEP_INTERVAL_MS,
  ACTIVITY_UPDATE_THROTTLE_MS,
  evictOldestActivityUpdateCacheEntry,
  sweepExpiredActivityUpdateCacheEntries,
} from "./guard-cache";

type ActivityUpdateResult = "updated" | "skipped" | "stale";

type ActivityUpdateStorage = Pick<IStorage, "updateActivity"> & {
  touchAuthenticatedActivity?: ((activityId: string) => Promise<UserActivity | undefined>) | undefined;
};

type ActivityUpdateLogger = Pick<typeof logger, "info">;

function hashActivityIdForAudit(activityId: string): string {
  return createHash("sha256")
    .update(activityId)
    .digest("base64url")
    .slice(0, 16);
}

export function createActivityUpdateThrottler(options: {
  activityUpdateThrottleMs?: number | undefined;
  logger?: ActivityUpdateLogger | undefined;
  storage: ActivityUpdateStorage;
}) {
  const storage = options.storage;
  const auditLogger = options.logger ?? logger;
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

  function logThrottledActivityUpdate(activityId: string, now: number) {
    auditLogger.info("Authenticated activity update throttled", {
      event: "activity_update_throttled",
      approximateTime: Math.floor(now / 60_000) * 60_000,
      activityIdHash: hashActivityIdForAudit(activityId),
      throttleMs: activityUpdateThrottleMs,
    });
  }

  return {
    clear() {
      activityUpdateCache.clear();
    },
    async updateAuthenticatedActivity(activityId: string): Promise<ActivityUpdateResult> {
      const now = Date.now();
      if (!reserveActivityUpdate(activityId, now)) {
        logThrottledActivityUpdate(activityId, now);
        return "skipped";
      }

      try {
        if (typeof storage.touchAuthenticatedActivity === "function") {
          const activity = await storage.touchAuthenticatedActivity(activityId);
          return activity ? "updated" : "stale";
        }

        await storage.updateActivity(activityId, {
          lastActivityTime: new Date(now),
        });
        return "updated";
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
