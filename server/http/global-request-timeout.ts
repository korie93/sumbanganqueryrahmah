import type { RequestHandler } from "express";
import { ERROR_CODES } from "../../shared/error-codes";
import { logger } from "../lib/logger";

type GlobalRequestTimeoutOptions = {
  timeoutMs: number;
  routeTimeouts?: readonly RequestTimeoutRouteOverride[] | undefined;
};

export type RequestTimeoutRouteOverride = {
  pathPrefix: string;
  timeoutMs: number;
};

export const LONG_OPERATION_REQUEST_TIMEOUTS_MS = {
  imports: 5 * 60 * 1000,
  backups: 10 * 60 * 1000,
  reports: 2 * 60 * 1000,
} as const;

const DEFAULT_LONG_OPERATION_TIMEOUT_ROUTES: readonly RequestTimeoutRouteOverride[] = [
  { pathPrefix: "/api/imports", timeoutMs: LONG_OPERATION_REQUEST_TIMEOUTS_MS.imports },
  { pathPrefix: "/api/backups", timeoutMs: LONG_OPERATION_REQUEST_TIMEOUTS_MS.backups },
  { pathPrefix: "/api/reports", timeoutMs: LONG_OPERATION_REQUEST_TIMEOUTS_MS.reports },
  { pathPrefix: "/api/collection/summary", timeoutMs: LONG_OPERATION_REQUEST_TIMEOUTS_MS.reports },
  { pathPrefix: "/api/collection/list", timeoutMs: LONG_OPERATION_REQUEST_TIMEOUTS_MS.reports },
  { pathPrefix: "/api/collection/monthly-comparison", timeoutMs: LONG_OPERATION_REQUEST_TIMEOUTS_MS.reports },
  { pathPrefix: "/api/collection/monthly-target", timeoutMs: LONG_OPERATION_REQUEST_TIMEOUTS_MS.reports },
  { pathPrefix: "/api/collection/nickname-summary", timeoutMs: LONG_OPERATION_REQUEST_TIMEOUTS_MS.reports },
  { pathPrefix: "/api/collection/daily/overview", timeoutMs: LONG_OPERATION_REQUEST_TIMEOUTS_MS.reports },
  { pathPrefix: "/api/collection/daily/day-details", timeoutMs: LONG_OPERATION_REQUEST_TIMEOUTS_MS.reports },
];

function normalizeTimeoutMs(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 0;
}

function isStreamingLikeRequest(path: string) {
  return path.startsWith("/ws");
}

function normalizePathPrefix(pathPrefix: string): string {
  const normalized = `/${String(pathPrefix || "").trim().replace(/^\/+/, "")}`;
  return normalized === "/" ? "" : normalized.replace(/\/+$/, "");
}

function isPathPrefixMatch(path: string, pathPrefix: string): boolean {
  return path === pathPrefix || path.startsWith(`${pathPrefix}/`);
}

export function resolveGlobalRequestTimeoutMs(
  path: string,
  fallbackTimeoutMs: number,
  routeTimeouts: readonly RequestTimeoutRouteOverride[] = DEFAULT_LONG_OPERATION_TIMEOUT_ROUTES,
): number {
  const normalizedPath = String(path || "").trim() || "/";
  let selectedTimeoutMs = normalizeTimeoutMs(fallbackTimeoutMs);
  let selectedPrefixLength = -1;

  for (const routeTimeout of routeTimeouts) {
    const pathPrefix = normalizePathPrefix(routeTimeout.pathPrefix);
    if (!pathPrefix || !isPathPrefixMatch(normalizedPath, pathPrefix)) {
      continue;
    }

    const timeoutMs = normalizeTimeoutMs(routeTimeout.timeoutMs);
    if (timeoutMs <= 0 || pathPrefix.length <= selectedPrefixLength) {
      continue;
    }

    selectedTimeoutMs = timeoutMs;
    selectedPrefixLength = pathPrefix.length;
  }

  return selectedTimeoutMs;
}

// Canonical whole-request deadline:
// - This middleware bounds every non-streaming HTTP request.
// - It owns the client-facing 504 response when the whole request exceeds
//   runtimeConfig.runtime.httpRequestTimeoutMs.
// - Operation-specific helpers must observe res.locals.requestAbortSignal and
//   stop work without writing a second response when this signal aborts.
export function createGlobalRequestTimeoutMiddleware(
  options: GlobalRequestTimeoutOptions,
): RequestHandler {
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const routeTimeouts = options.routeTimeouts ?? DEFAULT_LONG_OPERATION_TIMEOUT_ROUTES;

  if (timeoutMs <= 0) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    if (isStreamingLikeRequest(req.path)) {
      next();
      return;
    }

    let settled = false;
    const controller = new AbortController();
    res.locals.requestAbortSignal = controller.signal;
    const requestTimeoutMs = resolveGlobalRequestTimeoutMs(req.path, timeoutMs, routeTimeouts);
    const requestId = String(res.getHeader("x-request-id") || req.headers["x-request-id"] || "").trim();

    const clear = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      res.off("finish", clear);
      res.off("close", clear);
    };

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      controller.abort();
      res.off("finish", clear);
      res.off("close", clear);

      logger.warn("HTTP request exceeded global timeout", {
        ...(requestId ? { requestId } : {}),
        method: req.method,
        path: req.path,
        timeoutMs: requestTimeoutMs,
      });

      if (res.headersSent || res.writableEnded) {
        return;
      }

      res.status(504).json({
        ok: false,
        message: "Request timed out.",
        error: {
          code: ERROR_CODES.REQUEST_TIMEOUT,
          message: "Request timed out.",
            ...(requestId ? { requestId } : {}),
            details: {
              timeoutMs: requestTimeoutMs,
            },
          },
        });
    }, requestTimeoutMs);
    timer.unref?.();

    res.once("finish", clear);
    res.once("close", clear);
    next();
  };
}
