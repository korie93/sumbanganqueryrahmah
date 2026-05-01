import type { Express, Request, RequestHandler } from "express";
import { routeHandler } from "../http/async-handler";
import { normalizeCorsOrigin, resolveAllowedCorsOrigins } from "../http/cors";

type TelemetryRouteDeps = {
  reportWebVital: RequestHandler;
  webVitalsDropGuard?: WebVitalsTelemetryDropGuard;
  webVitalsRequestGuard?: RequestHandler;
};

type WebVitalsTelemetryDropGuardOptions = {
  maxEventsPerWindow?: number;
  maxBuckets?: number;
  now?: () => number;
  sweepIntervalMs?: false | number;
  windowMs?: number;
};

export type WebVitalsTelemetryDropGuard = RequestHandler & {
  stopWebVitalsTelemetryDropGuard?: () => void;
};

type WebVitalsTelemetryRequestGuardOptions = {
  allowedOrigins?: string[];
  maxContentLengthBytes?: number;
};

type CloseLifecycle = {
  once: (event: "close", listener: () => void) => unknown;
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
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site" && fetchSite !== "none") {
    return false;
  }

  const rawOrigin = req.headers.origin;
  const origin = normalizeCorsOrigin(req.headers.origin);
  if (rawOrigin && !origin) {
    return false;
  }
  if (origin && !allowedOriginSet.has(origin)) {
    return false;
  }

  const rawReferer = req.headers.referer;
  const referer = normalizeCorsOrigin(req.headers.referer);
  if (rawReferer && !referer) {
    return false;
  }
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
): WebVitalsTelemetryDropGuard {
  const maxEventsPerWindow = clampPositiveInteger(
    options.maxEventsPerWindow,
    DEFAULT_WEB_VITALS_MAX_EVENTS_PER_WINDOW,
  );
  const maxBuckets = clampPositiveInteger(options.maxBuckets, DEFAULT_WEB_VITALS_MAX_BUCKETS);
  const windowMs = clampPositiveInteger(options.windowMs, DEFAULT_WEB_VITALS_WINDOW_MS);
  const sweepIntervalMs = options.sweepIntervalMs === false
    ? 0
    : clampPositiveInteger(options.sweepIntervalMs, Math.min(windowMs, DEFAULT_WEB_VITALS_WINDOW_MS));
  const now = options.now ?? Date.now;
  const buckets = new Map<string, TelemetryBucket>();
  let sweepHandle: ReturnType<typeof setInterval> | null = null;

  const resolveOldestBucketKey = () => {
    let oldestKey: string | null = null;
    let oldestWindowEndsAtMs = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of buckets) {
      if (bucket.windowEndsAtMs < oldestWindowEndsAtMs) {
        oldestKey = key;
        oldestWindowEndsAtMs = bucket.windowEndsAtMs;
      }
    }

    return oldestKey;
  };

  const sweepExpiredBuckets = (nowMs: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.windowEndsAtMs <= nowMs) {
        buckets.delete(key);
      }
    }

    if (buckets.size <= maxBuckets) {
      return;
    }

    while (buckets.size > maxBuckets) {
      const oldestKey = resolveOldestBucketKey();
      if (!oldestKey) {
        break;
      }
      buckets.delete(oldestKey);
    }
  };

  if (sweepIntervalMs > 0) {
    sweepHandle = setInterval(() => {
      sweepExpiredBuckets(now());
    }, sweepIntervalMs);
    sweepHandle.unref();
  }

  const guard: WebVitalsTelemetryDropGuard = (req, res, next) => {
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

  guard.stopWebVitalsTelemetryDropGuard = () => {
    if (!sweepHandle) {
      return;
    }

    clearInterval(sweepHandle);
    sweepHandle = null;
  };

  return guard;
}

export function registerWebVitalsTelemetryDropGuardCleanup(
  server: CloseLifecycle,
  webVitalsDropGuard: WebVitalsTelemetryDropGuard,
) {
  server.once("close", () => {
    webVitalsDropGuard.stopWebVitalsTelemetryDropGuard?.();
  });
}

export function registerTelemetryRoutes(app: Express, deps: TelemetryRouteDeps) {
  const webVitalsDropGuard = deps.webVitalsDropGuard ?? createWebVitalsTelemetryDropGuard();

  // This route intentionally stays outside /api so browser sendBeacon/keepalive
  // Web Vitals reports do not require a CSRF token. It is still guarded by
  // same-site Origin/Referer checks, JSON content-type validation, a 4KB parser
  // limit in the HTTP pipeline, and bounded per-IP drop buckets. Do not send
  // PII, auth/session identifiers, cookies, tokens, or raw user input here.
  app.post(
    "/telemetry/web-vitals",
    deps.webVitalsRequestGuard ?? createWebVitalsTelemetryRequestGuard(),
    webVitalsDropGuard,
    routeHandler(deps.reportWebVital),
  );
}
