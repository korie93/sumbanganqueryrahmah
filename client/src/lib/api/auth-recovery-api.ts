import { apiRequest } from "../api-client";
import {
  authActivationTokenResponseSchema,
  authMessageResponseSchema,
  authPasswordResetTokenResponseSchema,
  authUserMutationResponseSchema,
} from "@shared/api-contracts";
import { parseApiJson } from "./contract";
import type {
  ActivationTokenValidationResponse,
  AuthMessageResponse,
  AuthUserMutationResponse,
  PasswordResetTokenValidationResponse,
  RequestOptions,
} from "./auth-types";

export async function validateActivationToken(
  payload: { token: string },
  options?: RequestOptions,
): Promise<ActivationTokenValidationResponse> {
  const response = await apiRequest("POST", "/api/auth/validate-activation-token", payload, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    authActivationTokenResponseSchema,
    "/api/auth/validate-activation-token",
  );
}

export async function activateAccount(
  payload: {
    username?: string;
    token: string;
    newPassword: string;
    confirmPassword: string;
  },
  options?: RequestOptions,
): Promise<AuthUserMutationResponse> {
  const response = await apiRequest("POST", "/api/auth/activate-account", payload, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    authUserMutationResponseSchema,
    "/api/auth/activate-account",
  );
}

export async function requestPasswordReset(
  payload: { identifier: string },
  options?: RequestOptions,
): Promise<AuthMessageResponse> {
  const response = await apiRequest("POST", "/api/auth/request-password-reset", payload, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    authMessageResponseSchema,
    "/api/auth/request-password-reset",
  );
}

export async function validatePasswordResetToken(
  payload: { token: string },
  options?: RequestOptions,
): Promise<PasswordResetTokenValidationResponse> {
  const response = await apiRequest("POST", "/api/auth/validate-password-reset-token", payload, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    authPasswordResetTokenResponseSchema,
    "/api/auth/validate-password-reset-token",
  );
}

export async function resetPasswordWithToken(
  payload: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  },
  options?: RequestOptions,
): Promise<AuthUserMutationResponse> {
  const response = await apiRequest("POST", "/api/auth/reset-password-with-token", payload, {
    signal: options?.signal,
  });
  return parseApiJson(
    response,
    authUserMutationResponseSchema,
    "/api/auth/reset-password-with-token",
  );
}
