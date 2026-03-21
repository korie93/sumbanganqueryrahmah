import type { RequestHandler } from "express";
import {
  AUTH_SESSION_COOKIE_NAME,
  readAuthSessionCsrfTokenFromHeaders,
  readCookieValueFromHeader,
} from "../auth/session-cookie";
import { normalizeCorsOrigin, resolveAllowedCorsOrigins } from "./cors";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type CsrfMiddlewareOptions = {
  allowedOrigins?: string[];
};

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

    // Protect cookie-authenticated API mutations; token-only/Bearer calls can bypass.
    const authCookie = readCookieValueFromHeader(req.headers.cookie, AUTH_SESSION_COOKIE_NAME);
    if (!authCookie) {
      return next();
    }

    // Strong check path: double-submit token (cookie + header).
    if (readAuthSessionCsrfTokenFromHeaders(req.headers)) {
      return next();
    }

    // Browser fallback checks: block cross-site fetch metadata and invalid origin/referrer.
    const fetchSite = String(req.headers["sec-fetch-site"] || "").trim().toLowerCase();
    if (fetchSite === "cross-site") {
      return res.status(403).json({
        ok: false,
        message: "CSRF protection blocked a cross-site request.",
        code: "CSRF_REJECTED",
      });
    }

    const requestOrigin = normalizeCorsOrigin(req.headers.origin);
    if (requestOrigin) {
      if (allowedOrigins.has(requestOrigin)) {
        return next();
      }
      return res.status(403).json({
        ok: false,
        message: "CSRF protection blocked a request with invalid origin.",
        code: "CSRF_ORIGIN_REJECTED",
      });
    }

    const requestReferer = normalizeCorsOrigin(req.headers.referer);
    if (requestReferer) {
      if (allowedOrigins.has(requestReferer)) {
        return next();
      }
      return res.status(403).json({
        ok: false,
        message: "CSRF protection blocked a request with invalid referrer.",
        code: "CSRF_REFERER_REJECTED",
      });
    }

    // Non-browser clients and tests may omit both origin and fetch metadata.
    return next();
  };
}
