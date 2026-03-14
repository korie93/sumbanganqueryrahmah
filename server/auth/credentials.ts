import type { Response } from "express";

export const CREDENTIAL_USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
export const CREDENTIAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CREDENTIAL_PASSWORD_MIN_LENGTH = 8;
export const CREDENTIAL_BCRYPT_COST = 12;

export type CredentialErrorCode =
  | "USERNAME_TAKEN"
  | "INVALID_PASSWORD"
  | "INVALID_EMAIL"
  | "INVALID_CURRENT_PASSWORD"
  | "PERMISSION_DENIED"
  | "USER_NOT_FOUND"
  | "ACCOUNT_UNAVAILABLE"
  | "PASSWORD_CHANGE_REQUIRED";

export type CredentialAuditPayload = {
  actor_user_id: string;
  target_user_id: string;
  changedField: "username" | "password";
};

export function normalizeUsernameInput(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function normalizeEmailInput(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isStrongPassword(raw: string): boolean {
  if (raw.length < CREDENTIAL_PASSWORD_MIN_LENGTH) return false;
  return /[A-Za-z]/.test(raw) && /\d/.test(raw);
}

export function sendCredentialError(
  res: Response,
  status: number,
  code: CredentialErrorCode,
  message: string,
) {
  return res.status(status).json({
    ok: false,
    error: { code, message },
  });
}

export function buildCredentialAuditDetails(payload: CredentialAuditPayload): string {
  return JSON.stringify({
    actor_user_id: payload.actor_user_id,
    target_user_id: payload.target_user_id,
    metadata: {
      changedField: payload.changedField,
    },
  });
}
