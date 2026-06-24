import { apiRequest } from "../api-client";
import {
  authTwoFactorSetupResponseSchema,
  authTwoFactorStatusResponseSchema,
  authUserForceLogoutResponseSchema,
  authUserMutationResponseSchema,
} from "@shared/api-contracts";
import { parseApiJson } from "./contract";
import type {
  AuthUserForceLogoutResponse,
  AuthUserMutationResponse,
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
): Promise<AuthUserForceLogoutResponse> {
  const response = await apiRequest("POST", "/api/auth/change-password", payload, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    authUserForceLogoutResponseSchema,
    "/api/auth/change-password",
  );
}

export async function getTwoFactorStatus(
  options?: RequestOptions,
): Promise<TwoFactorStatusResponse> {
  const response = await apiRequest("GET", "/api/auth/two-factor", undefined, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    authTwoFactorStatusResponseSchema,
    "/api/auth/two-factor",
  );
}

export async function startTwoFactorSetup(
  payload: { currentPassword: string },
  options?: RequestOptions,
): Promise<TwoFactorSetupResponse> {
  const response = await apiRequest("POST", "/api/auth/two-factor/setup", payload, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    authTwoFactorSetupResponseSchema,
    "/api/auth/two-factor/setup",
  );
}

export async function enableTwoFactor(
  payload: { code: string },
  options?: RequestOptions,
): Promise<AuthUserMutationResponse> {
  const response = await apiRequest("POST", "/api/auth/two-factor/enable", payload, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    authUserMutationResponseSchema,
    "/api/auth/two-factor/enable",
  );
}

export async function disableTwoFactor(
  payload: { currentPassword: string; code: string },
  options?: RequestOptions,
): Promise<AuthUserMutationResponse> {
  const response = await apiRequest("POST", "/api/auth/two-factor/disable", payload, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    authUserMutationResponseSchema,
    "/api/auth/two-factor/disable",
  );
}

export async function updateMyCredentials(payload: {
  newUsername?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<AuthUserForceLogoutResponse> {
  const response = await apiRequest("PATCH", "/api/me/credentials", payload);
  return parseApiJson(
    response,
    authUserForceLogoutResponseSchema,
    "/api/me/credentials",
  );
}
