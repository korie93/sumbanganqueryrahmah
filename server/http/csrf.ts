import type { RequestHandler } from "express";
import {
  AUTH_SESSION_COOKIE_NAME,
  readAuthSessionCsrfTokenFromHeaders,
  readCookieValueFromHeader,
  rotateAuthSessionCsrfCookie,
} from "../auth/session-cookie";
import { logger } from "../lib/logger";
import { normalizeCorsOrigin, resolveAllowedCorsOrigins } from "./cors";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type CsrfMiddlewareOptions = {
  allowedOrigins?: string[];
};

function hasBrowserRequestSignal(req: Parameters<RequestHandler>[0]) {
  return Boolean(
    String(req.headers["sec-fetch-site"] || "").trim()
    || String(req.headers.origin || "").trim()
    || String(req.headers.referer || "").trim(),
  );
}

function logCsrfRejection(req: Parameters<RequestHandler>[0], code: string, details?: Record<string, unknown>) {
  logger.warn("CSRF request rejected", {
    code,
    method: req.method,
    path: req.path,
    origin: req.headers.origin || null,
    referer: req.headers.referer || null,
    fetchSite: req.headers["sec-fetch-site"] || null,
    ...details,
  });
}

function attachCsrfRotationOnSuccessfulResponse(
  res: Parameters<RequestHandler>[1],
) {
  // Rotate the double-submit token when a cookie-authenticated mutation succeeds so the
  // browser keeps a short-lived token without introducing server-side CSRF session state.
  let rotated = false;
  const originalWriteHead = res.writeHead.bind(res);

  res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
    if (!rotated && res.statusCode < 400) {
      rotateAuthSessionCsrfCookie(res);
      rotated = true;
    }
    return originalWriteHead(...args);
  }) as typeof res.writeHead;
}

export function createCsrfProtectionMiddleware(options: CsrfMiddlewareOptions = {}): RequestHandler {
  const allowedOrigins = new Set(
    (options.allowedOrigins || resolveAllowedCorsOrigins())
      .map((value) => normalizeCorsOrigin(value))
      .filter((value): value is string => Boolean(value)),
  );

  return (req, res, next) => {
    if (!UNSAFE_METHODS.has(String(req.method || "").toUpperCase())) {
      return next();
    }

    if (!req.path.startsWith("/api/")) {
      return next();
    }

    // Protect cookie-authenticated API mutations. Token-only and non-browser clients may bypass
    // when they do not present browser-origin signals that can be evaluated safely.
    const authCookie = readCookieValueFromHeader(req.headers.cookie, AUTH_SESSION_COOKIE_NAME);
    if (!authCookie && !hasBrowserRequestSignal(req)) {
      return next();
    }

    // Strong check path: double-submit token (cookie + header).
    if (readAuthSessionCsrfTokenFromHeaders(req.headers)) {
      if (authCookie) {
        attachCsrfRotationOnSuccessfulResponse(res);
      }
      return next();
    }

    // Browser fallback checks: block cross-site fetch metadata and invalid origin/referrer.
    const fetchSite = String(req.headers["sec-fetch-site"] || "").trim().toLowerCase();
    if (fetchSite === "cross-site") {
      logCsrfRejection(req, "CSRF_REJECTED");
      return res.status(403).json({
        ok: false,
        message: "CSRF protection blocked a cross-site request.",
        code: "CSRF_REJECTED",
      });
    }
    if (fetchSite === "same-origin") {
      if (authCookie) {
        attachCsrfRotationOnSuccessfulResponse(res);
      }
      return next();
    }

    const requestOrigin = normalizeCorsOrigin(req.headers.origin);
    if (requestOrigin) {
      if (allowedOrigins.has(requestOrigin)) {
        if (authCookie) {
          attachCsrfRotationOnSuccessfulResponse(res);
        }
        return next();
      }
      logCsrfRejection(req, "CSRF_ORIGIN_REJECTED", { requestOrigin });
      return res.status(403).json({
        ok: false,
        message: "CSRF protection blocked a request with invalid origin.",
        code: "CSRF_ORIGIN_REJECTED",
      });
    }

    const requestReferer = normalizeCorsOrigin(req.headers.referer);
    if (requestReferer) {
      if (allowedOrigins.has(requestReferer)) {
        if (authCookie) {
          attachCsrfRotationOnSuccessfulResponse(res);
        }
        return next();
      }
      logCsrfRejection(req, "CSRF_REFERER_REJECTED", { requestReferer });
      return res.status(403).json({
        ok: false,
        message: "CSRF protection blocked a request with invalid referrer.",
        code: "CSRF_REFERER_REJECTED",
      });
    }

    logCsrfRejection(req, "CSRF_SIGNAL_MISSING");
    return res.status(403).json({
      ok: false,
      message: "CSRF protection requires a valid same-origin signal or CSRF token.",
      code: "CSRF_SIGNAL_MISSING",
    });
  };
}
