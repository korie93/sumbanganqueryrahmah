import type { Request } from "express";
import { normalizeCorsOrigin, resolveAllowedCorsOrigins } from "../http/cors";

const NON_BROWSER_TELEMETRY_USER_AGENT_PATTERNS = [
  /\bcurl\//i,
  /\bwget\//i,
  /\bpython-requests\//i,
  /\bhttpie\//i,
  /\bpostmanruntime\//i,
  /\binsomnia\//i,
  /\bgo-http-client\//i,
];

export function clampPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function resolveTelemetryBucketKey(req: Request) {
  return String(req.ip || req.socket.remoteAddress || "unknown").trim() || "unknown";
}

export function parseContentLength(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function isJsonContentType(value: unknown) {
  const contentType = String(value || "").toLowerCase();
  if (!contentType) {
    return false;
  }
  return contentType.includes("application/json") || contentType.includes("+json");
}

export function isCspReportContentType(value: unknown) {
  const contentType = String(value || "").toLowerCase();
  if (!contentType) {
    return false;
  }
  return contentType.includes("application/csp-report")
    || contentType.includes("application/reports+json")
    || isJsonContentType(contentType);
}

export function hasBrowserProvenanceSignal(req: Request) {
  const fetchSite = String(req.headers["sec-fetch-site"] || "").trim();
  const origin = String(req.headers.origin || "").trim();
  const referer = String(req.headers.referer || "").trim();

  return Boolean(fetchSite || origin || referer);
}

export function hasKnownNonBrowserTelemetryUserAgent(req: Request) {
  const userAgent = String(req.headers["user-agent"] || "").trim();
  if (!userAgent) {
    return false;
  }

  return NON_BROWSER_TELEMETRY_USER_AGENT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

export function resolveAllowedOriginSet(allowedOrigins?: string[]) {
  const origins = allowedOrigins ?? resolveAllowedCorsOrigins();
  return new Set(
    origins
      .map((origin) => normalizeCorsOrigin(origin))
      .filter((origin): origin is string => Boolean(origin)),
  );
}

export function isSameSiteTelemetryRequest(req: Request, allowedOriginSet: Set<string>) {
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
