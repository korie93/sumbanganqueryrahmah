import type { Express, Request, RequestHandler } from "express";
import { routeHandler } from "../http/async-handler";
import { normalizeCorsOrigin, resolveAllowedCorsOrigins } from "../http/cors";

type TelemetryRouteDeps = {
  reportWebVital: RequestHandler;
  webVitalsDropGuard?: RequestHandler;
  webVitalsRequestGuard?: RequestHandler;
};

type WebVitalsTelemetryDropGuardOptions = {
  maxEventsPerWindow?: number;
  maxBuckets?: number;
  now?: () => number;
  windowMs?: number;
};

type WebVitalsTelemetryRequestGuardOptions = {
  allowedOrigins?: string[];
  maxContentLengthBytes?: number;
};

type TelemetryBucket = {
  count: number;
  windowEndsAtMs: number;
};

const DEFAULT_WEB_VITALS_MAX_EVENTS_PER_WINDOW = 60;
const DEFAULT_WEB_VITALS_MAX_BUCKETS = 2_000;
const DEFAULT_WEB_VITALS_WINDOW_MS = 60_000;
const DEFAULT_WEB_VITALS_MAX_CONTENT_LENGTH_BYTES = 4 * 1024;

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

function parseContentLength(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isJsonContentType(value: unknown) {
  const contentType = String(value || "").toLowerCase();
  if (!contentType) {
    return false;
  }
  return contentType.includes("application/json") || contentType.includes("+json");
}

function resolveAllowedOriginSet(allowedOrigins?: string[]) {
  const origins = allowedOrigins ?? resolveAllowedCorsOrigins();
  return new Set(
    origins
      .map((origin) => normalizeCorsOrigin(origin))
      .filter((origin): origin is string => Boolean(origin)),
  );
}

function isSameSiteTelemetryRequest(req: Request, allowedOriginSet: Set<string>) {
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") {
    return false;
  }

  const origin = normalizeCorsOrigin(req.headers.origin);
  if (origin && !allowedOriginSet.has(origin)) {
    return false;
  }

  const referer = normalizeCorsOrigin(req.headers.referer);
  if (!origin && referer && !allowedOriginSet.has(referer)) {
    return false;
  }

  return true;
}

export function createWebVitalsTelemetryRequestGuard(
  options: WebVitalsTelemetryRequestGuardOptions = {},
): RequestHandler {
  const allowedOriginSet = resolveAllowedOriginSet(options.allowedOrigins);
  const maxContentLengthBytes = clampPositiveInteger(
    options.maxContentLengthBytes,
    DEFAULT_WEB_VITALS_MAX_CONTENT_LENGTH_BYTES,
  );

  return (req, res, next) => {
    if (!isSameSiteTelemetryRequest(req, allowedOriginSet)) {
      res.status(204).end();
      return;
    }

    const contentLength = parseContentLength(req.headers["content-length"]);
    if (contentLength !== null && contentLength > maxContentLengthBytes) {
      res.status(204).end();
      return;
    }

    if (!isJsonContentType(req.headers["content-type"])) {
      res.status(204).end();
      return;
    }

    next();
  };
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
    deps.webVitalsRequestGuard ?? createWebVitalsTelemetryRequestGuard(),
    deps.webVitalsDropGuard ?? createWebVitalsTelemetryDropGuard(),
    routeHandler(deps.reportWebVital),
  );
}
