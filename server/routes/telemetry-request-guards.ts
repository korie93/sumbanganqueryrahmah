import type { RequestHandler } from "express";
import { internalMetrics, type InternalMetricsRecorder } from "../internal/metrics";
import {
  clampPositiveInteger,
  hasBrowserProvenanceSignal,
  hasKnownNonBrowserTelemetryUserAgent,
  isCspReportContentType,
  isJsonContentType,
  isSameSiteTelemetryRequest,
  parseContentLength,
  resolveAllowedOriginSet,
} from "./telemetry-guard-utils";

const DEFAULT_WEB_VITALS_MAX_CONTENT_LENGTH_BYTES = 4 * 1024;
const DEFAULT_CLIENT_ERROR_MAX_CONTENT_LENGTH_BYTES = 4 * 1024;
const DEFAULT_CSP_REPORT_MAX_CONTENT_LENGTH_BYTES = 8 * 1024;

export type CspReportRequestGuardOptions = {
  allowedOrigins?: string[];
  maxContentLengthBytes?: number;
  metrics?: InternalMetricsRecorder;
};

export type WebVitalsTelemetryRequestGuardOptions = {
  allowedOrigins?: string[];
  maxContentLengthBytes?: number;
  metrics?: InternalMetricsRecorder;
};

export type ClientErrorTelemetryRequestGuardOptions = {
  allowedOrigins?: string[];
  maxContentLengthBytes?: number;
  metrics?: InternalMetricsRecorder;
};

export function createClientErrorTelemetryRequestGuard(
  options: ClientErrorTelemetryRequestGuardOptions = {},
): RequestHandler {
  const allowedOriginSet = resolveAllowedOriginSet(options.allowedOrigins);
  const metrics = options.metrics ?? internalMetrics;
  const maxContentLengthBytes = clampPositiveInteger(
    options.maxContentLengthBytes,
    DEFAULT_CLIENT_ERROR_MAX_CONTENT_LENGTH_BYTES,
  );

  return (req, res, next) => {
    const drop = () => {
      metrics.increment("clientErrorsDroppedTotal");
      metrics.increment("clientErrorsDroppedRequestGuardTotal");
      res.status(204).end();
    };

    if (
      hasKnownNonBrowserTelemetryUserAgent(req)
      || !hasBrowserProvenanceSignal(req)
      || !isSameSiteTelemetryRequest(req, allowedOriginSet)
    ) {
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
