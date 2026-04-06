import { apiRequest } from "../api-client";
import type {
  AuthUserForceLogoutResponse,
  AuthUserResponse,
  RequestOptions,
  TwoFactorSetupResponse,
  TwoFactorStatusResponse,
} from "./auth-types";

export async function changeMyPassword(
  payload: {
    currentPassword: string;
    newPassword: string;
  },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/change-password", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<AuthUserForceLogoutResponse>;
}

export async function getTwoFactorStatus(options?: RequestOptions) {
  const response = await apiRequest("GET", "/api/auth/two-factor", undefined, {
    signal: options?.signal,
  });
  return response.json() as Promise<TwoFactorStatusResponse>;
}

export async function startTwoFactorSetup(
  payload: { currentPassword: string },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/two-factor/setup", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<TwoFactorSetupResponse>;
}

export async function enableTwoFactor(
  payload: { code: string },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/two-factor/enable", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<AuthUserResponse>;
}

export async function disableTwoFactor(
  payload: { currentPassword: string; code: string },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/two-factor/disable", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<AuthUserResponse>;
}

export async function updateMyCredentials(payload: {
  newUsername?: string;
  currentPassword?: string;
  newPassword?: string;
}) {
  const response = await apiRequest("PATCH", "/api/me/credentials", payload);
  return response.json() as Promise<AuthUserForceLogoutResponse>;
}
