import type { Request, RequestHandler } from "express";
import { WEB_VITALS_TELEMETRY_PATHS as WEB_VITALS_TELEMETRY_PATH_VALUES } from "../routes/telemetry-route-constants";
import type { WorkerControlState } from "./runtime-monitor-manager";
import { logger as defaultLogger } from "../lib/logger";

type ApiProtectionOptions = {
  adaptiveRateStore?: AdaptiveRateStateStore | null;
  getControlState: () => WorkerControlState;
  getDbProtection: () => boolean;
};

const ADAPTIVE_RATE_WINDOW_MS = 10_000;
const ADAPTIVE_RATE_STALE_GRACE_MS = 10_000;
const ADAPTIVE_RATE_SWEEP_INTERVAL_MS = 30_000;
const ADAPTIVE_RATE_MAX_BUCKETS = 5_000;
const WEB_VITALS_TELEMETRY_PATHS: ReadonlySet<string> = new Set(WEB_VITALS_TELEMETRY_PATH_VALUES);

type AdaptiveRateBucket = {
  count: number;
  lastSeenAt: number;
  resetAt: number;
};

class AdaptiveRateStateUnavailableError extends Error {
  constructor(message = "Adaptive rate state store is unavailable.") {
    super(message);
    this.name = "AdaptiveRateStateUnavailableError";
  }
}

export type AdaptiveRateStateStore = {
  close?: () => Promise<void> | void;
  increment: (options: {
    bucketKey: string;
    now: number;
    staleGraceMs: number;
    windowMs: number;
  }) => Promise<AdaptiveRateBucket | null>;
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

function isWebVitalsTelemetryRoute(req: Pick<Request, "method" | "path">): boolean {
  const method = String(req.method || "GET").toUpperCase();
  const path = req.path || "/";
  return method === "POST" && WEB_VITALS_TELEMETRY_PATHS.has(path);
}

export function isRuntimeProtectedRoute(req: Pick<Request, "method" | "path">): boolean {
  const path = req.path || "/";
  return path.startsWith("/api/") || isWebVitalsTelemetryRoute(req);
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

function setAdaptiveRateLimitHeaders(
  res: Parameters<RequestHandler>[1],
  options: {
    limit: number;
    retryAfterMs: number;
  },
) {
  const resetSeconds = Math.max(1, Math.ceil(options.retryAfterMs / 1000));
  res.setHeader("RateLimit-Limit", String(Math.max(0, Math.trunc(options.limit))));
  res.setHeader("RateLimit-Remaining", "0");
  res.setHeader("RateLimit-Reset", String(resetSeconds));
  res.setHeader("Retry-After", String(resetSeconds));
}

export function resolveAdaptiveRateLruEvictionKey(
  buckets: ReadonlyMap<string, AdaptiveRateBucket>,
): string | null {
  const oldestEntry = buckets.keys().next();
  return oldestEntry.done ? null : oldestEntry.value;
}

export function createApiProtectionMiddleware(options: ApiProtectionOptions): {
  adaptiveRateLimit: RequestHandler;
  systemProtectionMiddleware: RequestHandler;
  sweepAdaptiveRateState: (now?: number) => void;
  stopAdaptiveRateStateSweep: () => void;
} {
  const adaptiveRateStore = options.adaptiveRateStore ?? null;
  const adaptiveRateState = new Map<string, AdaptiveRateBucket>();
  let adaptiveRateStateQueue: Promise<void> = Promise.resolve();
  let lastAdaptiveSweepAt = 0;
  let adaptiveRateSweepStopped = false;
  let adaptiveRateStoreFailureEmitted = false;

  function runAdaptiveRateStateExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const run = adaptiveRateStateQueue.then(operation, operation);
    adaptiveRateStateQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function setAdaptiveRateBucket(bucketKey: string, bucket: AdaptiveRateBucket) {
    if (adaptiveRateState.has(bucketKey)) {
      adaptiveRateState.delete(bucketKey);
    }
    adaptiveRateState.set(bucketKey, bucket);

    while (adaptiveRateState.size > ADAPTIVE_RATE_MAX_BUCKETS) {
      const oldestBucketKey = resolveAdaptiveRateLruEvictionKey(adaptiveRateState);
      if (!oldestBucketKey) {
        break;
      }
      adaptiveRateState.delete(oldestBucketKey);
    }
  }

  function sweepAdaptiveRateStateSync(now = Date.now()) {
    for (const [bucketKey, bucket] of adaptiveRateState.entries()) {
      if (now >= bucket.resetAt + ADAPTIVE_RATE_STALE_GRACE_MS) {
        adaptiveRateState.delete(bucketKey);
      }
    }
    lastAdaptiveSweepAt = now;
  }

  const sweepAdaptiveRateState = (now = Date.now()) => {
    void runAdaptiveRateStateExclusive(() => sweepAdaptiveRateStateSync(now)).catch((error) => {
      defaultLogger.warn("Adaptive rate local state sweep failed", {
        error: error instanceof Error ? error.message : "Unknown adaptive rate sweep failure",
      });
    });
  };

  function maybeSweepAdaptiveRateStateSync(now: number) {
    if (
      adaptiveRateState.size >= ADAPTIVE_RATE_MAX_BUCKETS
      || now - lastAdaptiveSweepAt >= ADAPTIVE_RATE_SWEEP_INTERVAL_MS
    ) {
      sweepAdaptiveRateStateSync(now);
    }
  }

  function incrementLocalAdaptiveRateBucketSync(bucketKey: string, now: number): AdaptiveRateBucket {
    maybeSweepAdaptiveRateStateSync(now);
    const bucket = adaptiveRateState.get(bucketKey);

    if (!bucket || now >= bucket.resetAt) {
      const nextBucket = {
        count: 1,
        lastSeenAt: now,
        resetAt: now + ADAPTIVE_RATE_WINDOW_MS,
      };
      setAdaptiveRateBucket(bucketKey, nextBucket);
      return nextBucket;
    }

    const nextBucket = {
      count: bucket.count + 1,
      lastSeenAt: now,
      resetAt: bucket.resetAt,
    };
    setAdaptiveRateBucket(bucketKey, nextBucket);
    return nextBucket;
  }

  function incrementLocalAdaptiveRateBucket(bucketKey: string, now: number): Promise<AdaptiveRateBucket> {
    return runAdaptiveRateStateExclusive(() => incrementLocalAdaptiveRateBucketSync(bucketKey, now));
  }

  async function incrementAdaptiveRateBucket(bucketKey: string, now: number): Promise<AdaptiveRateBucket> {
    if (adaptiveRateStore) {
      try {
        const storedBucket = await adaptiveRateStore.increment({
          bucketKey,
          now,
          staleGraceMs: ADAPTIVE_RATE_STALE_GRACE_MS,
          windowMs: ADAPTIVE_RATE_WINDOW_MS,
        });
        if (storedBucket) {
          adaptiveRateStoreFailureEmitted = false;
          return storedBucket;
        }
      } catch (error) {
        if (!adaptiveRateStoreFailureEmitted) {
          adaptiveRateStoreFailureEmitted = true;
          defaultLogger.error("Adaptive rate shared state unavailable; rejecting protected requests closed", {
            error: error instanceof Error ? error.message : "Unknown adaptive rate store failure",
          });
        }
        throw new AdaptiveRateStateUnavailableError();
      }

      if (!adaptiveRateStoreFailureEmitted) {
        adaptiveRateStoreFailureEmitted = true;
        defaultLogger.error("Adaptive rate shared state returned no bucket; rejecting protected requests closed");
      }
      throw new AdaptiveRateStateUnavailableError();
    }

    return incrementLocalAdaptiveRateBucket(bucketKey, now);
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
    void Promise.resolve(adaptiveRateStore?.close?.()).catch((error) => {
      defaultLogger.warn("Failed to close adaptive rate state store during shutdown", {
        error: error instanceof Error ? error.message : "Unknown adaptive rate store close failure",
      });
    });
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
    } else if (method === "POST" && WEB_VITALS_TELEMETRY_PATHS.has(path)) {
      bucketScope = "telemetry";
      baseLimit = 30;
      minLimit = 6;
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
    } else if (method === "GET" && path.startsWith("/api/analytics/")) {
      bucketScope = "analytics";
      baseLimit = 120;
      minLimit = 24;
    } else if (path.startsWith("/api/collection")) {
      bucketScope = "collection";
      baseLimit = 80;
      minLimit = 16;
    }

    const modePenalty = controlState.mode === "PROTECTION" ? 0.5 : controlState.mode === "DEGRADED" ? 0.75 : 1;
    const throttle = clamp(controlState.throttleFactor || 1, 0.2, 1.2);
    const dynamicLimit = Math.max(minLimit, Math.floor(baseLimit * modePenalty * throttle));

    return { bucketKey: `${ip}:${bucketScope}`, dynamicLimit };
  }

  const adaptiveRateLimit: RequestHandler = (req, res, next) => {
    let operation: Promise<unknown>;
    try {
      operation = (async () => {
        const controlState = options.getControlState();
        if (!isRuntimeProtectedRoute(req)) return next();
        if (isSessionControlRoute(req)) return next();

        const now = Date.now();
        const { bucketKey, dynamicLimit } = resolveAdaptiveRateBucket(req);
        let nextBucket: AdaptiveRateBucket;
        try {
          nextBucket = await incrementAdaptiveRateBucket(bucketKey, now);
        } catch (error) {
          if (error instanceof AdaptiveRateStateUnavailableError) {
            res.setHeader("Retry-After", "5");
            return res.status(503).json({
              message: "Request protection state is temporarily unavailable.",
              protection: true,
              reason: "adaptive_rate_state_unavailable",
            });
          }
          throw error;
        }
        if (nextBucket.count > dynamicLimit) {
          const retryAfterMs = Math.max(0, nextBucket.resetAt - now);
          setAdaptiveRateLimitHeaders(res, {
            limit: dynamicLimit,
            retryAfterMs,
          });
          return res.status(429).json({
            message: "Too many requests under current system load.",
            limit: dynamicLimit,
            retryAfterMs,
            mode: controlState.mode,
          });
        }

        return next();
      })();
    } catch (error) {
      next(error);
      return;
    }

    void operation.catch(next);
  };

  const systemProtectionMiddleware: RequestHandler = (req, res, next) => {
    const controlState = options.getControlState();
    if (!isRuntimeProtectedRoute(req)) return next();
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
