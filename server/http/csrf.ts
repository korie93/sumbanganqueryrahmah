import type { OutgoingHttpHeader, OutgoingHttpHeaders } from "node:http";
import type { RequestHandler, Response } from "express";
import {
  AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_CSRF_COOKIE_NAME,
  readAuthSessionCsrfTokenFromHeaders,
  readCookieValueFromHeader,
  rotateAuthSessionCsrfCookie,
} from "../auth/session-cookie";
import { logger } from "../lib/logger";
import {
  CANONICAL_WEB_VITALS_TELEMETRY_PATH,
  LEGACY_WEB_VITALS_TELEMETRY_PATH,
} from "../routes/telemetry-route-constants";
import { isBrowserProvenanceSameSiteTelemetryRequest } from "../routes/telemetry-guard-utils";
import { normalizeCorsOrigin, resolveAllowedCorsOrigins } from "./cors";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_TELEMETRY_EXEMPT_PATHS = new Set([
  "/api/csp-report",
  CANONICAL_WEB_VITALS_TELEMETRY_PATH,
  LEGACY_WEB_VITALS_TELEMETRY_PATH,
]);

type CsrfMiddlewareOptions = {
  allowedOrigins?: string[];
};

export type CsrfPrivilegeEscalationReason =
  | "two_factor_login_verified"
  | "two_factor_setup_started"
  | "two_factor_enabled"
  | "two_factor_disabled"
  | "own_credentials_updated";

type CsrfPrivilegeEscalationRotationContext = {
  reason: CsrfPrivilegeEscalationReason;
  route?: string | undefined;
};

const CSRF_ROTATION_QUEUED_LOCAL_KEY = "sqrCsrfRotationQueued";
const CSRF_ROTATION_WRITE_HEAD_PATCHED_LOCAL_KEY = "sqrCsrfRotationWriteHeadPatched";

type WriteHeadArgs = [
  statusCode: number,
  statusMessageOrHeaders?: string | OutgoingHttpHeaders | OutgoingHttpHeader[],
  headers?: OutgoingHttpHeaders | OutgoingHttpHeader[],
];

function getResponseLocals(res: Response): Record<string, unknown> {
  const responseWithOptionalLocals = res as Response & {
    locals?: Record<string, unknown> | undefined;
  };
  responseWithOptionalLocals.locals ??= {};
  return responseWithOptionalLocals.locals;
}

function responseHasPendingCsrfCookie(res: Response): boolean {
  const setCookie = res.getHeader("Set-Cookie");
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  return values.some((value) => typeof value === "string" && value.includes(`${AUTH_SESSION_CSRF_COOKIE_NAME}=`));
}

export function rotateCsrfTokenAfterPrivilegeEscalation(
  res: Response,
  context: CsrfPrivilegeEscalationRotationContext,
): void {
  rotateCsrfTokenOnce(res, "CSRF token rotation enforced after privilege escalation", {
    event: "csrf_privilege_escalation_rotation",
    reason: context.reason,
    route: context.route ?? null,
  });
}

function rotateCsrfTokenOnce(
  res: Response,
  message: string,
  context: Record<string, unknown>,
): void {
  const locals = getResponseLocals(res);
  const alreadyQueued = locals[CSRF_ROTATION_QUEUED_LOCAL_KEY] === true || responseHasPendingCsrfCookie(res);
  locals[CSRF_ROTATION_QUEUED_LOCAL_KEY] = true;

  if (!alreadyQueued) {
    rotateAuthSessionCsrfCookie(res);
  }

  logger.info(message, {
    ...context,
    rotated: !alreadyQueued,
    reusedPendingRotation: alreadyQueued,
  });
}

function isSuccessfulResponseStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

function queueCsrfTokenRotationForSuccessfulMutation(req: Parameters<RequestHandler>[0], res: Response): void {
  const locals = getResponseLocals(res);
  if (locals[CSRF_ROTATION_WRITE_HEAD_PATCHED_LOCAL_KEY] === true) {
    return;
  }

  locals[CSRF_ROTATION_WRITE_HEAD_PATCHED_LOCAL_KEY] = true;

  const originalWriteHead = res.writeHead.bind(res) as (...args: WriteHeadArgs) => Response;
  res.writeHead = ((...args: WriteHeadArgs) => {
    const [statusCode] = args;
    if (!res.headersSent && isSuccessfulResponseStatus(statusCode)) {
      rotateCsrfTokenOnce(res, "CSRF token rotation enforced after successful state-changing operation", {
        event: "csrf_state_changing_rotation",
        method: req.method,
        path: req.path,
      });
    }

    return originalWriteHead(...args);
  }) as Response["writeHead"];
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

function logCsrfTelemetryRejection(req: Parameters<RequestHandler>[0], code: string) {
  logger.warn("CSRF telemetry request rejected", {
    code,
    method: req.method,
    path: req.path,
    fetchSite: req.headers["sec-fetch-site"] || null,
    hasOrigin: Boolean(req.headers.origin),
    hasReferer: Boolean(req.headers.referer),
  });
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

    const isTelemetryPath = CSRF_TELEMETRY_EXEMPT_PATHS.has(req.path);
    if (!req.path.startsWith("/api/") && !isTelemetryPath) {
      return next();
    }

    // Protect cookie-authenticated API mutations; token-only/Bearer calls can bypass.
    const authCookie = readCookieValueFromHeader(req.headers.cookie, AUTH_SESSION_COOKIE_NAME);

    // Browser-owned telemetry is append-only aggregate data. These endpoints
    // rely on their own origin/content/drop guards and must remain usable from
    // sendBeacon/keepalive contexts without a CSRF header. When ambient auth
    // cookies are present, keep a CSRF-layer same-site safety net so local/test
    // routes cannot accidentally expose an unguarded telemetry sink.
    if (isTelemetryPath) {
      if (
        !authCookie
        || readAuthSessionCsrfTokenFromHeaders(req.headers)
        || isBrowserProvenanceSameSiteTelemetryRequest(req, allowedOrigins)
      ) {
        return next();
      }

      const code = "CSRF_TELEMETRY_ORIGIN_REJECTED";
      logCsrfTelemetryRejection(req, code);
      return res.status(403).json({
        ok: false,
        message: "CSRF protection blocked a telemetry request without a trusted browser origin signal.",
        code,
      });
    }

    if (!authCookie) {
      return next();
    }

    queueCsrfTokenRotationForSuccessfulMutation(req, res);

    // Strong check path: double-submit token (cookie + header).
    if (readAuthSessionCsrfTokenFromHeaders(req.headers)) {
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
      return next();
    }

    const requestOrigin = normalizeCorsOrigin(req.headers.origin);
    if (requestOrigin) {
      if (allowedOrigins.has(requestOrigin)) {
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
