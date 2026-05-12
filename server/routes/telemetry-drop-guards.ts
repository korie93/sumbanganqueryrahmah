import type { RequestHandler } from "express";
import { internalMetrics, type InternalMetricsRecorder } from "../internal/metrics";
import { createTelemetryBucketStore } from "./telemetry-drop-buckets";
import {
  clampPositiveInteger,
  hasBrowserProvenanceSignal,
  resolveTelemetryBucketKey,
} from "./telemetry-guard-utils";

const DEFAULT_WEB_VITALS_MAX_EVENTS_PER_WINDOW = 60;
const DEFAULT_WEB_VITALS_MAX_ANONYMOUS_EVENTS_PER_WINDOW = 10;
const DEFAULT_WEB_VITALS_MAX_BUCKETS = 2_000;
const DEFAULT_WEB_VITALS_WINDOW_MS = 60_000;
const DEFAULT_CSP_REPORT_MAX_REPORTS_PER_WINDOW = 30;
const DEFAULT_CSP_REPORT_MAX_BUCKETS = 2_000;
const DEFAULT_CSP_REPORT_WINDOW_MS = 60_000;

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

type CloseLifecycle = {
  once: (event: "close", listener: () => void) => unknown;
};

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
  const bucketStore = createTelemetryBucketStore({
    maxBuckets,
    now,
    sweepIntervalMs,
    windowMs,
  });

  const guard: CspReportDropGuard = (req, res, next) => {
    const nowMs = now();
    bucketStore.sweepExpired(nowMs);

    const key = resolveTelemetryBucketKey(req);
    const bucket = bucketStore.getBucket(key, nowMs);

    if (bucket.count > maxReportsPerWindow) {
      metrics.increment("cspReportsDroppedTotal");
      metrics.increment("cspReportsDroppedRateLimitTotal");
      res.status(204).end();
      return;
    }

    next();
  };

  guard.stopCspReportDropGuard = () => {
    bucketStore.stop();
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
  const bucketStore = createTelemetryBucketStore({
    maxBuckets,
    now,
    sweepIntervalMs,
    windowMs,
  });

  const guard: WebVitalsTelemetryDropGuard = (req, res, next) => {
    const nowMs = now();
    bucketStore.sweepExpired(nowMs);

    const key = resolveTelemetryBucketKey(req);
    const bucket = bucketStore.getBucket(key, nowMs);

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
    bucketStore.stop();
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
