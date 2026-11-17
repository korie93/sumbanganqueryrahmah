import { createHash } from "node:crypto";
import type { ErrorRequestHandler, Request } from "express";
import rateLimit, { ipKeyGenerator, type Store } from "express-rate-limit";
import { ERROR_CODES } from "../../shared/error-codes";
import { runtimeConfig } from "../config/runtime";
import { buildApiErrorResponse } from "../http/api-error-response";
import { resolveRequestClientIp } from "../http/client-ip";
import { isRuntimeProtectedRoute } from "../internal/apiProtection";
import {
  BoundedMemoryRateLimitStore,
  createSharedRateLimitStore,
  RedisRateLimitStoreUnavailableError,
} from "./redis-rate-limit-store";

const WINDOW_MS = 10_000;

/** Coarse network ceiling before CSRF/JWT work, never a per-user quota.
 * Reuse the existing shared-office flood ceiling and window; do not shrink it
 * in protection mode. The later identity-aware and route limits remain intact.
 */
export function createPreAuthRateLimiter(options: {
  store?: Store;
  requestsPerMinute?: number;
  allPaths?: boolean;
} = {}) {
  const requestsPerMinute = options.requestsPerMinute
    ?? runtimeConfig.rateLimiting.authenticatedIpRequestsPerMinute;
  if (!Number.isFinite(requestsPerMinute) || requestsPerMinute <= 0) {
    throw new Error("Pre-auth request ceiling must be a positive finite number.");
  }
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: Math.max(1, Math.ceil(requestsPerMinute * WINDOW_MS / 60_000)),
    store: options.store ?? createSharedRateLimitStore({
      config: runtimeConfig.rateLimiting.store,
      prefix: "sqr:rate-limit:pre-auth-ip-v1",
    }) ?? new BoundedMemoryRateLimitStore(Date.now),
    // Do not replace headers describing the later, tighter account quota.
    standardHeaders: false,
    legacyHeaders: false,
    requestPropertyName: "preAuthRateLimit",
    passOnStoreError: false,
    // Express routes are case-insensitive by default. Match that routing
    // behavior so /API/auth/... cannot bypass the pre-verification ceiling.
    skip: (req) => options.allPaths !== true && !isRuntimeProtectedRoute({
      method: req.method,
      path: req.path.toLowerCase(),
    }),
    keyGenerator: (req) => createHash("sha256")
      .update(ipKeyGenerator(resolveRequestClientIp(req) ?? "unknown"))
      .digest("hex"),
    handler: (req, res) => {
      const resetTime = (req as Request & { preAuthRateLimit?: { resetTime?: Date } })
        .preAuthRateLimit?.resetTime;
      const retryAfterMs = resetTime instanceof Date
        ? Math.max(1, resetTime.getTime() - Date.now()) : WINDOW_MS;
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1_000))));
      res.setHeader("Cache-Control", "no-store");
      res.status(429).json(buildApiErrorResponse("Too many requests. Please try again shortly.", {
        statusCode: 429,
        code: ERROR_CODES.RATE_LIMITED,
      }));
    },
  });
}

// Keep the limiter itself directly installed in Express. Store failure cannot
// bypass it or run CSRF, JWT verification, authorization or a route controller.
export const handlePreAuthRateLimitError: ErrorRequestHandler = (error, _req, res, next) => {
  if (!(error instanceof RedisRateLimitStoreUnavailableError)) {
    next(error);
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Retry-After", "5");
  res.status(503).json(buildApiErrorResponse("Request protection is temporarily unavailable.", {
    statusCode: 503,
    code: ERROR_CODES.SERVICE_UNAVAILABLE,
  }));
};
