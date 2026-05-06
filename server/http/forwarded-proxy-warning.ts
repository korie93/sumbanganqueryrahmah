import type { Request, RequestHandler } from "express";
import { logger as defaultLogger } from "../lib/logger";

type LoggerLike = Pick<typeof defaultLogger, "warn">;

type ForwardedForTrustProxyWarningOptions = {
  logger?: LoggerLike;
  logOnce?: boolean;
  trustedProxies: readonly string[];
};

function hasForwardedForHeader(req: Request): boolean {
  const value = req.headers["x-forwarded-for"];
  if (Array.isArray(value)) {
    return value.some((entry) => String(entry || "").trim().length > 0);
  }

  return String(value || "").trim().length > 0;
}

export function createForwardedForTrustProxyWarningMiddleware(
  options: ForwardedForTrustProxyWarningOptions,
): RequestHandler {
  const logger = options.logger ?? defaultLogger;
  const logOnce = options.logOnce !== false;
  const trustedProxiesConfigured = options.trustedProxies.length > 0;
  let warningEmitted = false;

  return (req, _res, next) => {
    if (
      !trustedProxiesConfigured
      && hasForwardedForHeader(req)
      && (!logOnce || !warningEmitted)
    ) {
      warningEmitted = true;
      logger.warn("TRUSTED_PROXIES not configured - rate limit may be ineffective", {
        forwardedForPresent: true,
        trustedProxiesConfigured: false,
      });
    }

    next();
  };
}
