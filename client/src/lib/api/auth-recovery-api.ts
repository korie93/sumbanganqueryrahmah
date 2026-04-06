import { apiRequest } from "../api-client";
import type {
  ActivationTokenValidationPayload,
  AuthMessageResponse,
  AuthUserResponse,
  PasswordResetTokenValidationPayload,
  RequestOptions,
} from "./auth-types";

export async function validateActivationToken(
  payload: { token: string },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/validate-activation-token", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<{
    ok: boolean;
    activation: ActivationTokenValidationPayload;
  }>;
}

export async function activateAccount(
  payload: {
    username?: string;
    token: string;
    newPassword: string;
    confirmPassword: string;
  },
  options?: RequestOptions,
) {
  const response = await apiRequest("POST", "/api/auth/activate-account", payload, {
    signal: options?.signal,
  });
  return response.json() as Promise<AuthUserResponse>;
}

export async function requestPasswordReset(payload: { identifier: string }) {
  const response = await apiRequest("POST", "/api/auth/request-password-reset", payload);
  return response.json() as Promise<AuthMessageResponse>;
}

export async function validatePasswordResetToken(payload: { token: string }) {
  const response = await apiRequest("POST", "/api/auth/validate-password-reset-token", payload);
  return response.json() as Promise<{
    ok: boolean;
    reset: PasswordResetTokenValidationPayload;
  }>;
}

export async function resetPasswordWithToken(payload: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const response = await apiRequest("POST", "/api/auth/reset-password-with-token", payload);
  return response.json() as Promise<AuthUserResponse>;
}
