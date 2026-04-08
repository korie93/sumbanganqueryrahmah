import { ERROR_CODES } from "@shared/error-codes";

import { apiRequest, createApiHeaders } from "../api-client";
import type {
  CurrentUser,
  LoginResponse,
  LoginSuccessResponse,
  RequestOptions,
} from "./auth-types";
import { API_BASE, getCsrfHeader } from "./shared";

import type { AuthUserResponse } from "./auth-types";

export async function login(
  username: string,
  password: string,
  fingerprint?: string,
  options?: RequestOptions,
): Promise<LoginResponse | { banned: true }> {
  const res = await fetch("/api/login", {
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
    }),
    credentials: "include",
    signal: options?.signal ?? null,
  });

  const data = await res.json();
  if (data.banned) {
    return { banned: true };
  }
  if (!res.ok) {
    const error = new Error(data?.message || data?.error?.message || "Login failed") as Error & {
      code?: string;
      locked?: boolean;
      status?: number;
      requestId?: string | null;
    };
    error.code = typeof data?.error?.code === "string" ? data.error.code : undefined;
    error.locked = data?.locked === true;
    if (error.code === ERROR_CODES.ACCOUNT_LOCKED) {
      error.locked = true;
    }
    error.status = res.status;
    error.requestId = res.headers.get("x-request-id");
    throw error;
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
  return payload.user;
}
