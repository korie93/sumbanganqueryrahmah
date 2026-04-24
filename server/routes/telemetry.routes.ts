import type { Express, Request, RequestHandler } from "express";
import { routeHandler } from "../http/async-handler";

type TelemetryRouteDeps = {
  reportWebVital: RequestHandler;
  webVitalsDropGuard?: RequestHandler;
};

type WebVitalsTelemetryDropGuardOptions = {
  maxEventsPerWindow?: number;
  maxBuckets?: number;
  now?: () => number;
  windowMs?: number;
};

type TelemetryBucket = {
  count: number;
  windowEndsAtMs: number;
};

const DEFAULT_WEB_VITALS_MAX_EVENTS_PER_WINDOW = 60;
const DEFAULT_WEB_VITALS_MAX_BUCKETS = 2_000;
const DEFAULT_WEB_VITALS_WINDOW_MS = 60_000;

function clampPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function resolveTelemetryBucketKey(req: Request) {
  return String(req.ip || req.socket.remoteAddress || "unknown").trim() || "unknown";
}

export function createWebVitalsTelemetryDropGuard(
  options: WebVitalsTelemetryDropGuardOptions = {},
): RequestHandler {
  const maxEventsPerWindow = clampPositiveInteger(
    options.maxEventsPerWindow,
    DEFAULT_WEB_VITALS_MAX_EVENTS_PER_WINDOW,
  );
  const maxBuckets = clampPositiveInteger(options.maxBuckets, DEFAULT_WEB_VITALS_MAX_BUCKETS);
  const windowMs = clampPositiveInteger(options.windowMs, DEFAULT_WEB_VITALS_WINDOW_MS);
  const now = options.now ?? Date.now;
  const buckets = new Map<string, TelemetryBucket>();

  const sweepExpiredBuckets = (nowMs: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.windowEndsAtMs <= nowMs) {
        buckets.delete(key);
      }
    }

    if (buckets.size <= maxBuckets) {
      return;
    }

    const excessCount = buckets.size - maxBuckets;
    const oldestKeys = Array.from(buckets.entries())
      .sort((left, right) => left[1].windowEndsAtMs - right[1].windowEndsAtMs)
      .slice(0, excessCount)
      .map(([key]) => key);
    for (const key of oldestKeys) {
      buckets.delete(key);
    }
  };

  return (req, res, next) => {
    const nowMs = now();
    sweepExpiredBuckets(nowMs);

    const key = resolveTelemetryBucketKey(req);
    const existingBucket = buckets.get(key);
    const bucket = existingBucket && existingBucket.windowEndsAtMs > nowMs
      ? existingBucket
      : { count: 0, windowEndsAtMs: nowMs + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > maxBuckets) {
      sweepExpiredBuckets(nowMs);
    }

    if (bucket.count > maxEventsPerWindow) {
      res.status(204).end();
      return;
    }

    next();
  };
}

export function registerTelemetryRoutes(app: Express, deps: TelemetryRouteDeps) {
  app.post(
    "/telemetry/web-vitals",
    deps.webVitalsDropGuard ?? createWebVitalsTelemetryDropGuard(),
    routeHandler(deps.reportWebVital),
  );
}
