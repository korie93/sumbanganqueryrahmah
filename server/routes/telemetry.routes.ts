import type { Express, Request, RequestHandler } from "express";
import { routeHandler } from "../http/async-handler";
import { normalizeCorsOrigin, resolveAllowedCorsOrigins } from "../http/cors";
import { internalMetrics, type InternalMetricsRecorder } from "../internal/metrics";

type TelemetryRouteDeps = {
  cspReportDropGuard?: CspReportDropGuard;
  cspReportRequestGuard?: RequestHandler;
  metrics?: InternalMetricsRecorder;
  reportWebVital: RequestHandler;
  webVitalsDropGuard?: WebVitalsTelemetryDropGuard;
  webVitalsRequestGuard?: RequestHandler;
};

type CspReportDropGuardOptions = {
  maxReportsPerWindow?: number;
  maxBuckets?: number;
  metrics?: InternalMetricsRecorder;
  now?: () => number;
  sweepIntervalMs?: false | number;
  windowMs?: number;
};

export type CspReportDropGuard = RequestHandler & {
  stopCspReportDropGuard?: () => void;
};

type CspReportRequestGuardOptions = {
  allowedOrigins?: string[];
  maxContentLengthBytes?: number;
  metrics?: InternalMetricsRecorder;
};

type WebVitalsTelemetryDropGuardOptions = {
  maxAnonymousEventsPerWindow?: number;
  maxEventsPerWindow?: number;
  maxBuckets?: number;
  metrics?: InternalMetricsRecorder;
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
  metrics?: InternalMetricsRecorder;
};

type CloseLifecycle = {
  once: (event: "close", listener: () => void) => unknown;
};

type TelemetryBucket = {
  count: number;
  windowEndsAtMs: number;
};

const DEFAULT_WEB_VITALS_MAX_EVENTS_PER_WINDOW = 60;
const DEFAULT_WEB_VITALS_MAX_ANONYMOUS_EVENTS_PER_WINDOW = 10;
const DEFAULT_WEB_VITALS_MAX_BUCKETS = 2_000;
const DEFAULT_WEB_VITALS_WINDOW_MS = 60_000;
const DEFAULT_WEB_VITALS_MAX_CONTENT_LENGTH_BYTES = 4 * 1024;
const DEFAULT_CSP_REPORT_MAX_REPORTS_PER_WINDOW = 30;
const DEFAULT_CSP_REPORT_MAX_BUCKETS = 2_000;
const DEFAULT_CSP_REPORT_WINDOW_MS = 60_000;
const DEFAULT_CSP_REPORT_MAX_CONTENT_LENGTH_BYTES = 8 * 1024;
export const WEB_VITALS_TELEMETRY_PATHS = [
  "/api/telemetry/web-vitals",
  "/telemetry/web-vitals",
] as const;
const NON_BROWSER_TELEMETRY_USER_AGENT_PATTERNS = [
  /\bcurl\//i,
  /\bwget\//i,
  /\bpython-requests\//i,
  /\bhttpie\//i,
  /\bpostmanruntime\//i,
  /\binsomnia\//i,
  /\bgo-http-client\//i,
];

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

function isCspReportContentType(value: unknown) {
  const contentType = String(value || "").toLowerCase();
  if (!contentType) {
    return false;
  }
  return contentType.includes("application/csp-report")
    || contentType.includes("application/reports+json")
    || isJsonContentType(contentType);
}

function hasBrowserProvenanceSignal(req: Request) {
  const fetchSite = String(req.headers["sec-fetch-site"] || "").trim();
  const origin = String(req.headers.origin || "").trim();
  const referer = String(req.headers.referer || "").trim();

  return Boolean(fetchSite || origin || referer);
}

function hasKnownNonBrowserTelemetryUserAgent(req: Request) {
  const userAgent = String(req.headers["user-agent"] || "").trim();
  if (!userAgent) {
    return false;
  }

  return NON_BROWSER_TELEMETRY_USER_AGENT_PATTERNS.some((pattern) => pattern.test(userAgent));
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
  const metrics = options.metrics ?? internalMetrics;
  const maxContentLengthBytes = clampPositiveInteger(
    options.maxContentLengthBytes,
    DEFAULT_WEB_VITALS_MAX_CONTENT_LENGTH_BYTES,
  );

  return (req, res, next) => {
    const drop = () => {
      metrics.increment("webVitalsDroppedTotal");
      metrics.increment("webVitalsDroppedRequestGuardTotal");
      res.status(204).end();
    };

    if (hasKnownNonBrowserTelemetryUserAgent(req)) {
      drop();
      return;
    }

    if (!isSameSiteTelemetryRequest(req, allowedOriginSet)) {
      drop();
      return;
    }

    const contentLength = parseContentLength(req.headers["content-length"]);
    if (contentLength !== null && contentLength > maxContentLengthBytes) {
      drop();
      return;
    }

    if (!isJsonContentType(req.headers["content-type"])) {
      drop();
      return;
    }

    next();
  };
}

export function createCspReportRequestGuard(
  options: CspReportRequestGuardOptions = {},
): RequestHandler {
  const allowedOriginSet = resolveAllowedOriginSet(options.allowedOrigins);
  const metrics = options.metrics ?? internalMetrics;
  const maxContentLengthBytes = clampPositiveInteger(
    options.maxContentLengthBytes,
    DEFAULT_CSP_REPORT_MAX_CONTENT_LENGTH_BYTES,
  );

  return (req, res, next) => {
    const drop = () => {
      metrics.increment("cspReportsDroppedTotal");
      metrics.increment("cspReportsDroppedRequestGuardTotal");
      res.status(204).end();
    };

    if (!isSameSiteTelemetryRequest(req, allowedOriginSet)) {
      drop();
      return;
    }

    const contentLength = parseContentLength(req.headers["content-length"]);
    if (contentLength !== null && contentLength > maxContentLengthBytes) {
      drop();
      return;
    }

    if (!isCspReportContentType(req.headers["content-type"])) {
      drop();
      return;
    }

    next();
  };
}

export function createCspReportDropGuard(
  options: CspReportDropGuardOptions = {},
): CspReportDropGuard {
  const maxReportsPerWindow = clampPositiveInteger(
    options.maxReportsPerWindow,
    DEFAULT_CSP_REPORT_MAX_REPORTS_PER_WINDOW,
  );
  const maxBuckets = clampPositiveInteger(options.maxBuckets, DEFAULT_CSP_REPORT_MAX_BUCKETS);
  const windowMs = clampPositiveInteger(options.windowMs, DEFAULT_CSP_REPORT_WINDOW_MS);
  const metrics = options.metrics ?? internalMetrics;
  const sweepIntervalMs = options.sweepIntervalMs === false
    ? 0
    : clampPositiveInteger(options.sweepIntervalMs, Math.min(windowMs, DEFAULT_CSP_REPORT_WINDOW_MS));
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

  const guard: CspReportDropGuard = (req, res, next) => {
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

    if (bucket.count > maxReportsPerWindow) {
      metrics.increment("cspReportsDroppedTotal");
      metrics.increment("cspReportsDroppedRateLimitTotal");
      res.status(204).end();
      return;
    }

    next();
  };

  guard.stopCspReportDropGuard = () => {
    if (!sweepHandle) {
      return;
    }

    clearInterval(sweepHandle);
    sweepHandle = null;
  };

  return guard;
}

export function createWebVitalsTelemetryDropGuard(
  options: WebVitalsTelemetryDropGuardOptions = {},
): WebVitalsTelemetryDropGuard {
  const maxEventsPerWindow = clampPositiveInteger(
    options.maxEventsPerWindow,
    DEFAULT_WEB_VITALS_MAX_EVENTS_PER_WINDOW,
  );
  const maxAnonymousEventsPerWindow = Math.min(
    maxEventsPerWindow,
    clampPositiveInteger(
      options.maxAnonymousEventsPerWindow,
      DEFAULT_WEB_VITALS_MAX_ANONYMOUS_EVENTS_PER_WINDOW,
    ),
  );
  const maxBuckets = clampPositiveInteger(options.maxBuckets, DEFAULT_WEB_VITALS_MAX_BUCKETS);
  const windowMs = clampPositiveInteger(options.windowMs, DEFAULT_WEB_VITALS_WINDOW_MS);
  const metrics = options.metrics ?? internalMetrics;
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

    const maxAllowedEvents = hasBrowserProvenanceSignal(req)
      ? maxEventsPerWindow
      : maxAnonymousEventsPerWindow;

    if (bucket.count > maxAllowedEvents) {
      metrics.increment("webVitalsDroppedTotal");
      metrics.increment("webVitalsDroppedRateLimitTotal");
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

export function registerCspReportDropGuardCleanup(
  server: CloseLifecycle,
  cspReportDropGuard: CspReportDropGuard,
) {
  server.once("close", () => {
    cspReportDropGuard.stopCspReportDropGuard?.();
  });
}

export function registerTelemetryRoutes(app: Express, deps: TelemetryRouteDeps) {
  const metrics = deps.metrics ?? internalMetrics;
  const cspReportDropGuard = deps.cspReportDropGuard ?? createCspReportDropGuard({ metrics });
  const webVitalsDropGuard = deps.webVitalsDropGuard ?? createWebVitalsTelemetryDropGuard();
  const webVitalsRequestGuard = deps.webVitalsRequestGuard ?? createWebVitalsTelemetryRequestGuard();

  // CSP reports may contain document URLs or blocked URIs, so this endpoint
  // deliberately records only aggregate counters and returns an empty 204.
  app.post(
    "/api/csp-report",
    deps.cspReportRequestGuard ?? createCspReportRequestGuard({ metrics }),
    cspReportDropGuard,
    routeHandler((_req, res) => {
      metrics.increment("cspReportsAcceptedTotal");
      res.status(204).end();
    }),
  );

  // Threat model: this unauthenticated browser telemetry endpoint is
  // internet-reachable and can receive forged beacons, oversized bodies,
  // replay bursts, or automation-client probes. The canonical route now lives
  // under /api for middleware consistency; the legacy path remains temporarily
  // compatible for already-deployed clients. Both paths are guarded by
  // same-site Origin/Referer checks, JSON content-type validation, a 4KB parser
  // limit in the HTTP pipeline, known non-browser client drops, stricter
  // anonymous/no-provenance request caps, and bounded per-IP drop buckets. The
  // payload schema is strict; do not send PII, auth/session identifiers,
  // cookies, tokens, or raw user input here.
  for (const telemetryPath of WEB_VITALS_TELEMETRY_PATHS) {
    app.post(
      telemetryPath,
      webVitalsRequestGuard,
      webVitalsDropGuard,
      routeHandler(deps.reportWebVital),
    );
  }
}
