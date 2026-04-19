import type { Response } from "express";
import { ERROR_CODES, type ErrorCode } from "../../shared/error-codes";
import {
  PASSWORD_POLICY_MIN_LENGTH,
  isStrongPassword as isStrongPasswordValue,
} from "../../shared/password-policy";

export const CREDENTIAL_USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
export const CREDENTIAL_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CREDENTIAL_PASSWORD_MIN_LENGTH = PASSWORD_POLICY_MIN_LENGTH;
export const CREDENTIAL_BCRYPT_COST = 12;

export type CredentialErrorCode = Extract<
  ErrorCode,
  | typeof ERROR_CODES.USERNAME_TAKEN
  | typeof ERROR_CODES.INVALID_PASSWORD
  | typeof ERROR_CODES.INVALID_EMAIL
  | typeof ERROR_CODES.INVALID_CURRENT_PASSWORD
  | typeof ERROR_CODES.PERMISSION_DENIED
  | typeof ERROR_CODES.USER_NOT_FOUND
  | typeof ERROR_CODES.ACCOUNT_UNAVAILABLE
  | typeof ERROR_CODES.PASSWORD_CHANGE_REQUIRED
>;

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
  return isStrongPasswordValue(raw);
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
