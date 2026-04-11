import type { Request, RequestHandler } from "express";
import type { WorkerControlState } from "./runtime-monitor-manager";

type ApiProtectionOptions = {
  getControlState: () => WorkerControlState;
  getDbProtection: () => boolean;
};

const ADAPTIVE_RATE_WINDOW_MS = 10_000;
const ADAPTIVE_RATE_STALE_GRACE_MS = 10_000;
const ADAPTIVE_RATE_SWEEP_INTERVAL_MS = 30_000;
const ADAPTIVE_RATE_MAX_BUCKETS = 5_000;

type AdaptiveRateBucket = {
  count: number;
  lastSeenAt: number;
  resetAt: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isHeavyRoute(pathname: string): boolean {
  return pathname.startsWith("/api/ai/")
    || pathname.startsWith("/api/imports")
    || pathname.startsWith("/api/search/advanced")
    || pathname.startsWith("/api/backups");
}

function isSessionControlRoute(req: Request): boolean {
  const method = String(req.method || "GET").toUpperCase();
  const path = req.path || "/";

  return (method === "GET" && (path === "/api/me" || path === "/api/auth/me"))
    || (method === "POST" && path === "/api/activity/logout");
}

export function resolveAdaptiveRateEvictionKey(
  buckets: ReadonlyMap<string, AdaptiveRateBucket>,
): string | null {
  let oldestBucketKey: string | null = null;
  let oldestLastSeenAt = Number.POSITIVE_INFINITY;
  let oldestResetAt = Number.POSITIVE_INFINITY;

  for (const [bucketKey, bucket] of buckets.entries()) {
    const lastSeenAt = Number.isFinite(bucket.lastSeenAt) ? bucket.lastSeenAt : bucket.resetAt;
    if (
      lastSeenAt < oldestLastSeenAt
      || (
        lastSeenAt === oldestLastSeenAt
        && bucket.resetAt < oldestResetAt
      )
    ) {
      oldestBucketKey = bucketKey;
      oldestLastSeenAt = lastSeenAt;
      oldestResetAt = bucket.resetAt;
    }
  }

  return oldestBucketKey;
}

export function createApiProtectionMiddleware(options: ApiProtectionOptions): {
  adaptiveRateLimit: RequestHandler;
  systemProtectionMiddleware: RequestHandler;
  sweepAdaptiveRateState: (now?: number) => void;
  stopAdaptiveRateStateSweep: () => void;
} {
  const adaptiveRateState = new Map<string, AdaptiveRateBucket>();
  let lastAdaptiveSweepAt = 0;
  let adaptiveRateSweepStopped = false;

  function setAdaptiveRateBucket(bucketKey: string, bucket: AdaptiveRateBucket) {
    adaptiveRateState.set(bucketKey, bucket);

    while (adaptiveRateState.size > ADAPTIVE_RATE_MAX_BUCKETS) {
      const oldestBucketKey = resolveAdaptiveRateEvictionKey(adaptiveRateState);
      if (!oldestBucketKey) {
        break;
      }
      adaptiveRateState.delete(oldestBucketKey);
    }
  }

  const sweepAdaptiveRateState = (now = Date.now()) => {
    for (const [bucketKey, bucket] of adaptiveRateState.entries()) {
      if (now >= bucket.resetAt + ADAPTIVE_RATE_STALE_GRACE_MS) {
        adaptiveRateState.delete(bucketKey);
      }
    }
    lastAdaptiveSweepAt = now;
  };

  function maybeSweepAdaptiveRateState(now: number) {
    if (
      adaptiveRateState.size >= ADAPTIVE_RATE_MAX_BUCKETS
      || now - lastAdaptiveSweepAt >= ADAPTIVE_RATE_SWEEP_INTERVAL_MS
    ) {
      sweepAdaptiveRateState(now);
    }
  }

  const adaptiveRateSweepHandle = setInterval(() => {
    sweepAdaptiveRateState(Date.now());
  }, ADAPTIVE_RATE_SWEEP_INTERVAL_MS);
  adaptiveRateSweepHandle.unref();

  function stopAdaptiveRateStateSweep() {
    if (adaptiveRateSweepStopped) {
      return;
    }
    adaptiveRateSweepStopped = true;
    clearInterval(adaptiveRateSweepHandle);
  }

  function resolveRateLimitClientIp(req: Request): string {
    const ip = String(req.ip || req.socket.remoteAddress || "unknown").trim();
    return ip || "unknown";
  }

  function resolveAdaptiveRateBucket(req: Request): {
    bucketKey: string;
    dynamicLimit: number;
  } {
    const controlState = options.getControlState();
    const ip = resolveRateLimitClientIp(req);
    const method = String(req.method || "GET").toUpperCase();
    const path = req.path || "/";

    let bucketScope = "api";
    let baseLimit = 40;
    let minLimit = 8;

    if (path.startsWith("/api/ai/")) {
      bucketScope = "ai";
      baseLimit = 14;
      minLimit = 4;
    } else if (path.startsWith("/api/activity/heartbeat")) {
      bucketScope = "heartbeat";
      baseLimit = 120;
      minLimit = 20;
    } else if (
      method === "GET"
      && (path.startsWith("/api/collection/nicknames") || path.startsWith("/api/collection/admin-groups"))
    ) {
      bucketScope = "collection-meta";
      baseLimit = 120;
      minLimit = 24;
    }

    const modePenalty = controlState.mode === "PROTECTION" ? 0.5 : controlState.mode === "DEGRADED" ? 0.75 : 1;
    const throttle = clamp(controlState.throttleFactor || 1, 0.2, 1.2);
    const dynamicLimit = Math.max(minLimit, Math.floor(baseLimit * modePenalty * throttle));

    return { bucketKey: `${ip}:${bucketScope}`, dynamicLimit };
  }

  const adaptiveRateLimit: RequestHandler = (req, res, next) => {
    const controlState = options.getControlState();
    if (!req.path.startsWith("/api/")) return next();
    if (isSessionControlRoute(req)) return next();

    const now = Date.now();
    maybeSweepAdaptiveRateState(now);
    const { bucketKey, dynamicLimit } = resolveAdaptiveRateBucket(req);
    const bucket = adaptiveRateState.get(bucketKey);

    if (!bucket || now >= bucket.resetAt) {
      setAdaptiveRateBucket(bucketKey, {
        count: 1,
        lastSeenAt: now,
        resetAt: now + ADAPTIVE_RATE_WINDOW_MS,
      });
      return next();
    }

    const nextBucket = {
      count: bucket.count + 1,
      lastSeenAt: now,
      resetAt: bucket.resetAt,
    };
    setAdaptiveRateBucket(bucketKey, nextBucket);
    if (nextBucket.count > dynamicLimit) {
      return res.status(429).json({
        message: "Too many requests under current system load.",
        limit: dynamicLimit,
        retryAfterMs: Math.max(0, nextBucket.resetAt - now),
        mode: controlState.mode,
      });
    }

    return next();
  };

  const systemProtectionMiddleware: RequestHandler = (req, res, next) => {
    const controlState = options.getControlState();
    if (!req.path.startsWith("/api/")) return next();
    if (req.path.startsWith("/api/health") || req.path.startsWith("/api/maintenance-status")) {
      return next();
    }

    const dbProtection = options.getDbProtection();

    if (dbProtection && req.path.startsWith("/api/search/advanced")) {
      return res.status(503).json({
        message: "Advanced search is temporarily disabled to protect database stability.",
        protection: true,
        reason: "db_latency_high",
      });
    }

    if (dbProtection && req.path.startsWith("/api/backups") && req.method !== "GET") {
      return res.status(503).json({
        message: "Export/backup write operations are temporarily disabled.",
        protection: true,
        reason: "db_latency_high",
      });
    }

    if (controlState.rejectHeavyRoutes && isHeavyRoute(req.path)) {
      return res.status(503).json({
        message: "Route temporarily throttled by protection mode.",
        protection: true,
        mode: controlState.mode,
      });
    }

    return next();
  };
  return {
    adaptiveRateLimit,
    systemProtectionMiddleware,
    sweepAdaptiveRateState,
    stopAdaptiveRateStateSweep,
  };
}
