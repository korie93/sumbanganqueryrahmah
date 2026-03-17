import type { IncomingHttpHeaders } from "node:http";
import type { Response } from "express";
import { runtimeConfig } from "../config/runtime";

export const AUTH_SESSION_COOKIE_NAME = "sqr_auth";
export const AUTH_SESSION_HINT_COOKIE_NAME = "sqr_auth_hint";
const AUTH_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type HeaderValue = string | string[] | undefined;

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
    sameSite: "lax" as const,
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

function readCookieValue(cookieHeader: HeaderValue, cookieName: string): string | null {
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
    } catch {
      return value;
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
    || readCookieValue(headers.cookie, AUTH_SESSION_COOKIE_NAME);
}

export function setAuthSessionCookie(res: Response, token: string) {
  res.cookie(AUTH_SESSION_COOKIE_NAME, token, {
    ...getAuthSessionCookieOptions(),
    maxAge: AUTH_SESSION_MAX_AGE_MS,
  });
  res.cookie(AUTH_SESSION_HINT_COOKIE_NAME, "1", {
    ...getAuthSessionHintCookieOptions(),
    maxAge: AUTH_SESSION_MAX_AGE_MS,
  });
}

export function clearAuthSessionCookie(res: Response) {
  res.clearCookie(AUTH_SESSION_COOKIE_NAME, getAuthSessionCookieOptions());
  res.clearCookie(AUTH_SESSION_HINT_COOKIE_NAME, getAuthSessionHintCookieOptions());
}
