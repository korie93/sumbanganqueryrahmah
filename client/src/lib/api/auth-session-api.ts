import { ERROR_CODES } from "@shared/error-codes";

import { apiRequest, createApiHeaders } from "../api-client";
import { notifyMaintenanceMode } from "./maintenance-navigation";
import type {
  CurrentUser,
  LoginResponse,
  LoginSuccessResponse,
  RequestOptions,
} from "./auth-types";
import { API_BASE, getCsrfHeader } from "./shared";

import type { AuthUserResponse } from "./auth-types";

function readRetryAfterMs(res: Response, data: unknown): number | undefined {
  const payloadRetryAfterMs = Number((data as { retryAfterMs?: unknown } | null)?.retryAfterMs);
  if (Number.isFinite(payloadRetryAfterMs) && payloadRetryAfterMs >= 0) {
    return payloadRetryAfterMs;
  }

  const headerRetryAfterSeconds = Number(res.headers.get("retry-after"));
  if (Number.isFinite(headerRetryAfterSeconds) && headerRetryAfterSeconds >= 0) {
    return headerRetryAfterSeconds * 1000;
  }

  return undefined;
}

type LoginError = Error & {
  captchaChallenge?: string | null;
  captchaRequired?: boolean;
  code?: string;
  locked?: boolean;
  retryAfterMs?: number;
  status?: number;
  requestId?: string | null;
};

type LoginRequestOptions = RequestOptions & {
  captchaResponse?: string | undefined;
};

function buildLoginError(message: string, res: Response, data?: unknown): LoginError {
  const error = new Error(message) as LoginError;
  const payload = data && typeof data === "object" ? data as {
    error?: { code?: unknown };
    locked?: unknown;
  } : null;

  if (typeof payload?.error?.code === "string") {
    error.code = payload.error.code;
  }
  error.locked = payload?.locked === true;
  if (error.code === ERROR_CODES.ACCOUNT_LOCKED) {
    error.locked = true;
  }
  const captchaRequired = (payload as { captcha_required?: unknown; captchaRequired?: unknown } | null);
  if (captchaRequired?.captcha_required === true || captchaRequired?.captchaRequired === true) {
    error.captchaRequired = true;
  }
  const captchaChallenge = (payload as { captcha_challenge?: unknown; captchaChallenge?: unknown } | null);
  if (typeof captchaChallenge?.captcha_challenge === "string") {
    error.captchaChallenge = captchaChallenge.captcha_challenge;
  } else if (typeof captchaChallenge?.captchaChallenge === "string") {
    error.captchaChallenge = captchaChallenge.captchaChallenge;
  }
  const retryAfterMs = readRetryAfterMs(res, data);
  if (retryAfterMs !== undefined) {
    error.retryAfterMs = retryAfterMs;
  }
  error.status = res.status;
  error.requestId = res.headers.get("x-request-id");

  return error;
}

function looksLikeHtmlDocument(value: string) {
  return /<!doctype html|<html[\s>]|<body[\s>]|<head[\s>]/i.test(value);
}

function resolveNonJsonLoginErrorMessage(res: Response, text: string) {
  if ((res.status === 502 || res.status === 503 || res.status === 504) && looksLikeHtmlDocument(text)) {
    return "Server sedang tidak tersedia. Sila cuba sebentar lagi.";
  }

  if (looksLikeHtmlDocument(text)) {
    return `Server mengembalikan halaman ralat (${res.status}). Sila cuba lagi.`;
  }

  const normalizedText = text.replace(/\s+/g, " ").trim();
  return normalizedText
    ? normalizedText.slice(0, 240)
    : res.statusText || "Login failed";
}

async function readLoginResponsePayload(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    const data = JSON.parse(text || "{}") as unknown;
    return data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};
  } catch {
    if (!res.ok) {
      throw buildLoginError(resolveNonJsonLoginErrorMessage(res, text), res);
    }

    throw buildLoginError("Server mengembalikan respons log masuk yang tidak sah.", res);
  }
}

export async function login(
  username: string,
  password: string,
  fingerprint?: string,
  options?: LoginRequestOptions,
): Promise<LoginResponse | { banned: true }> {
  const captchaResponse = String(options?.captchaResponse || "").trim();
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: createApiHeaders({
      "Content-Type": "application/json",
      ...(getCsrfHeader() as Record<string, string>),
    }),
    body: JSON.stringify({
      username: username.toLowerCase().trim(),
      password,
      fingerprint,
      browser: navigator.userAgent,
      ...(captchaResponse ? { captchaResponse } : {}),
    }),
    credentials: "include",
    signal: options?.signal ?? null,
  });

  const data = await readLoginResponsePayload(res);
  if (data.banned) {
    return { banned: true };
  }
  if (res.status === 503 && data.maintenance === true) {
    notifyMaintenanceMode(data);
  }
  if (!res.ok) {
    const nestedError = data.error && typeof data.error === "object"
      ? data.error as { message?: unknown }
      : null;
    throw buildLoginError(
      typeof data.message === "string"
        ? data.message
        : typeof nestedError?.message === "string"
          ? nestedError.message
          : "Login failed",
      res,
      data,
    );
  }

  return data as LoginResponse;
}

export async function verifyTwoFactorLogin(
  payload: { challengeToken: string; code: string },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/verify-two-factor-login", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<LoginSuccessResponse>;
}

export async function checkHealth(options?: RequestOptions) {
  const response = await fetch(`${API_BASE}/api/health`, {
    headers: createApiHeaders(),
    signal: options?.signal ?? null,
  });
  return response.json();
}

export async function getMe(options?: RequestOptions): Promise<CurrentUser> {
  const response = await apiRequest("GET", "/api/me", undefined, {
    signal: options?.signal,
  });
  const payload = (await response.json()) as AuthUserResponse;
  if (!payload.user) {
    throw new Error("Authenticated user payload is missing.");
  }
  return {
    ...payload.user,
    sessionExpiresAt: payload.sessionExpiresAt ?? null,
  };
}
