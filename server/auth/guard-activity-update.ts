import { createHash } from "node:crypto";
import type { IStorage } from "../storage-postgres";
import type { UserActivity } from "../../shared/schema-postgres";
import { internalMetrics } from "../internal/metrics";
import { logger } from "../lib/logger";
import {
  ACTIVITY_UPDATE_CACHE_MAX_SIZE,
  ACTIVITY_UPDATE_CACHE_TTL_MS,
  ACTIVITY_UPDATE_THROTTLE_MS,
  createActivityUpdateLruCache,
  purgeStaleLruCacheEntries,
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

function normalizeCacheLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(Number(value)));
}

export function createActivityUpdateThrottler(options: {
  activityUpdateThrottleMs?: number | undefined;
  cacheMaxSize?: number | undefined;
  cachePreemptiveEvictionThreshold?: number | undefined;
  cacheTargetSizeAfterEviction?: number | undefined;
  logger?: ActivityUpdateLogger | undefined;
  storage: ActivityUpdateStorage;
}) {
  const storage = options.storage;
  const auditLogger = options.logger ?? logger;
  const activityUpdateThrottleMs = Math.max(0, options.activityUpdateThrottleMs ?? ACTIVITY_UPDATE_THROTTLE_MS);
  const cacheMaxSize = normalizeCacheLimit(options.cacheMaxSize, ACTIVITY_UPDATE_CACHE_MAX_SIZE);
  void options.cachePreemptiveEvictionThreshold;
  void options.cacheTargetSizeAfterEviction;
  const activityUpdateCache = createActivityUpdateLruCache({
    maxSize: cacheMaxSize,
    ttlMs: ACTIVITY_UPDATE_CACHE_TTL_MS,
    onDispose: (_updatedAt, _activityId, reason) => {
      if (reason === "evict") {
        internalMetrics.increment("authActivityUpdateCacheEvictionsTotal");
      }
      if (reason === "expire") {
        internalMetrics.increment("authActivityUpdateCacheExpiredEntriesTotal");
      }
    },
  });
  let stopped = false;

  function publishMetrics(): void {
    activityUpdateCache.purgeStale();
    internalMetrics.gauge("authActivityUpdateCacheSize", activityUpdateCache.size);
    internalMetrics.gauge("authActivityUpdateCacheUtilization", activityUpdateCache.size / cacheMaxSize);
  }

  function sweepExpiredReservations(now = Date.now()): number {
    void now;
    const removed = purgeStaleLruCacheEntries(activityUpdateCache);
    publishMetrics();
    return removed;
  }

  function reserveActivityUpdate(activityId: string, now: number) {
    if (activityUpdateThrottleMs <= 0) {
      return true;
    }

    sweepExpiredReservations(now);
    const lastUpdatedAt = activityUpdateCache.get(activityId);
    if (lastUpdatedAt !== undefined && now - lastUpdatedAt < activityUpdateThrottleMs) {
      return false;
    }

    activityUpdateCache.set(activityId, now, { start: now });
    publishMetrics();
    return true;
  }

  function releaseFailedActivityUpdateReservation(activityId: string, reservedAt: number) {
    if (activityUpdateThrottleMs > 0 && activityUpdateCache.get(activityId) === reservedAt) {
      activityUpdateCache.delete(activityId);
      publishMetrics();
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
      publishMetrics();
    },
    getStats() {
      return {
        size: activityUpdateCache.size,
        maxSize: cacheMaxSize,
        preemptiveEvictionThreshold: cacheMaxSize,
        targetSizeAfterEviction: cacheMaxSize,
        utilization: activityUpdateCache.size / cacheMaxSize,
      };
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
      publishMetrics();
    },
  };
}
