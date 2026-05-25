import type { IncomingHttpHeaders } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { runtimeConfig } from "../config/runtime";
import { logger } from "../lib/logger";
import { AUTH_SESSION_MAX_AGE_MS as AUTH_SESSION_COOKIE_MAX_AGE_MS } from "./session-lifetime";

export const AUTH_SESSION_COOKIE_NAME = "sqr_auth";
export const AUTH_SESSION_HINT_COOKIE_NAME = "sqr_auth_hint";
export const AUTH_SESSION_CSRF_COOKIE_NAME = "sqr_csrf";
export const AUTH_SESSION_CSRF_HEADER_NAME = "X-CSRF-Token";
export { AUTH_SESSION_MAX_AGE_MS } from "./session-lifetime";

type HeaderValue = string | string[] | undefined;
const CSRF_TOKEN_COMPARE_BYTES = 64;

function firstHeaderValue(value: HeaderValue): string {
  if (Array.isArray(value)) {
    return String(value[0] || "");
  }
  return String(value || "");
}

function shouldUseSecureAuthCookie() {
  return runtimeConfig.auth.cookieSecure;
}

function getBaseAuthCookieOptions() {
  return {
    sameSite: runtimeConfig.auth.cookieSameSite,
    secure: shouldUseSecureAuthCookie(),
    path: "/",
  };
}

function getAuthSessionCookieOptions() {
  return {
    ...getBaseAuthCookieOptions(),
    httpOnly: true,
  };
}

function getAuthSessionHintCookieOptions() {
  return {
    ...getBaseAuthCookieOptions(),
    httpOnly: false,
  };
}

function getAuthSessionCsrfCookieOptions() {
  return {
    ...getBaseAuthCookieOptions(),
    httpOnly: false,
  };
}

function createCsrfToken() {
  return randomBytes(32).toString("hex");
}

function setAuthSessionCsrfCookie(res: Response, csrfToken: string) {
  res.setHeader(AUTH_SESSION_CSRF_HEADER_NAME, csrfToken);
  res.cookie(AUTH_SESSION_CSRF_COOKIE_NAME, csrfToken, {
    ...getAuthSessionCsrfCookieOptions(),
    maxAge: AUTH_SESSION_COOKIE_MAX_AGE_MS,
  });
}

function equalSafeToken(left: string, right: string): boolean {
  const leftRawBuffer = Buffer.from(String(left || ""), "utf8");
  const rightRawBuffer = Buffer.from(String(right || ""), "utf8");
  const leftBuffer = Buffer.alloc(CSRF_TOKEN_COMPARE_BYTES);
  const rightBuffer = Buffer.alloc(CSRF_TOKEN_COMPARE_BYTES);
  leftRawBuffer.copy(leftBuffer, 0, 0, Math.min(leftRawBuffer.length, CSRF_TOKEN_COMPARE_BYTES));
  rightRawBuffer.copy(rightBuffer, 0, 0, Math.min(rightRawBuffer.length, CSRF_TOKEN_COMPARE_BYTES));

  try {
    const equal = timingSafeEqual(leftBuffer, rightBuffer);
    return leftRawBuffer.length === CSRF_TOKEN_COMPARE_BYTES
      && rightRawBuffer.length === CSRF_TOKEN_COMPARE_BYTES
      && equal;
  } catch {
    return false;
  }
}

export function readCookieValueFromHeader(cookieHeader: HeaderValue, cookieName: string): string | null {
  const rawCookieHeader = firstHeaderValue(cookieHeader);
  if (!rawCookieHeader) {
    return null;
  }

  const pairs = rawCookieHeader.split(";");
  for (const pair of pairs) {
    const [rawName, ...rawValueParts] = pair.split("=");
    const name = String(rawName || "").trim();
    if (name !== cookieName) {
      continue;
    }

    const value = rawValueParts.join("=").trim();
    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch (error) {
      logger.warn("Failed to decode auth cookie value", {
        cookieName,
        error: error instanceof Error ? error.message : "Unknown cookie decode failure",
      });
      return null;
    }
  }

  return null;
}

function readBearerToken(authorizationHeader: HeaderValue): string | null {
  const rawAuthorization = firstHeaderValue(authorizationHeader).trim();
  if (!rawAuthorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = rawAuthorization.slice(7).trim();
  return token || null;
}

export function readAuthSessionTokenFromHeaders(
  headers: Pick<IncomingHttpHeaders, "authorization" | "cookie">,
): string | null {
  return readBearerToken(headers.authorization)
    || readCookieValueFromHeader(headers.cookie, AUTH_SESSION_COOKIE_NAME);
}

export function readAuthSessionCsrfTokenFromHeaders(
  headers: Pick<IncomingHttpHeaders, "cookie"> & Partial<Pick<IncomingHttpHeaders, "x-csrf-token">>,
): string | null {
  const cookieToken = readCookieValueFromHeader(headers.cookie, AUTH_SESSION_CSRF_COOKIE_NAME);
  const headerValue = firstHeaderValue(headers["x-csrf-token"]).trim();
  if (!cookieToken || !headerValue) {
    return null;
  }
  return equalSafeToken(cookieToken, headerValue) ? headerValue : null;
}

export function setAuthSessionCookie(res: Response, token: string) {
  const csrfToken = createCsrfToken();
  res.cookie(AUTH_SESSION_COOKIE_NAME, token, {
    ...getAuthSessionCookieOptions(),
    maxAge: AUTH_SESSION_COOKIE_MAX_AGE_MS,
  });
  res.cookie(AUTH_SESSION_HINT_COOKIE_NAME, "1", {
    ...getAuthSessionHintCookieOptions(),
    maxAge: AUTH_SESSION_COOKIE_MAX_AGE_MS,
  });
  setAuthSessionCsrfCookie(res, csrfToken);
}

export function rotateAuthSessionCsrfCookie(res: Response) {
  setAuthSessionCsrfCookie(res, createCsrfToken());
}

export function clearAuthSessionCookie(res: Response) {
  res.cookie(AUTH_SESSION_COOKIE_NAME, "", {
    ...getAuthSessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
  res.cookie(AUTH_SESSION_HINT_COOKIE_NAME, "", {
    ...getAuthSessionHintCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
  res.cookie(AUTH_SESSION_CSRF_COOKIE_NAME, "", {
    ...getAuthSessionCsrfCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
}
