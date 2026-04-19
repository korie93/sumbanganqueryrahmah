import { addHours } from "date-fns";
import { isManageableUserRole, normalizeAccountStatus } from "../auth/account-lifecycle";
import { isStrongPassword } from "../auth/credentials";
import { generateOneTimeToken, hashOpaqueToken } from "../auth/passwords";
import { PASSWORD_POLICY_ERROR_MESSAGE_EN } from "../../shared/password-policy";
import type {
  AccountActivationTokenSummary,
  PasswordResetTokenSummary,
} from "../storage-postgres";
import {
  ACTIVATION_TOKEN_TTL_HOURS,
  AuthAccountError,
  PASSWORD_RESET_TOKEN_TTL_HOURS,
} from "./auth-account-types";
import { ERROR_CODES } from "../../shared/error-codes";

export type IssuedOpaqueToken = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

export type UsableActivationTokenRecord = AccountActivationTokenSummary & {
  activatedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
};

export type UsablePasswordResetTokenRecord = PasswordResetTokenSummary & {
  activatedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
};

export type ActivationTokenRecordLike = Omit<
  AccountActivationTokenSummary,
  "activatedAt" | "createdAt" | "expiresAt" | "usedAt"
> & {
  activatedAt: Date | string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  usedAt: Date | string | null;
};

export type PasswordResetTokenRecordLike = Omit<
  PasswordResetTokenSummary,
  "activatedAt" | "createdAt" | "expiresAt" | "usedAt"
> & {
  activatedAt: Date | string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  usedAt: Date | string | null;
};

const UTC_NAIVE_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/;

function normalizeTokenDateValue(value: Date | string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const asUtcNaiveTimestamp = UTC_NAIVE_TIMESTAMP_PATTERN.test(normalized)
    ? normalized.replace(" ", "T").replace(/$/, "Z")
    : normalized;

  return new Date(asUtcNaiveTimestamp);
}

function normalizeTokenDates<
  TRecord extends {
    activatedAt: Date | string | null;
    createdAt: Date | string;
    expiresAt: Date | string;
    usedAt: Date | string | null;
  },
>(
  record: TRecord,
) {
  return {
    ...record,
    activatedAt: normalizeTokenDateValue(record.activatedAt),
    createdAt: normalizeTokenDateValue(record.createdAt) ?? new Date(Number.NaN),
    expiresAt: normalizeTokenDateValue(record.expiresAt) ?? new Date(Number.NaN),
    usedAt: normalizeTokenDateValue(record.usedAt),
  };
}

export function createActivationTokenPayload(now = new Date()): IssuedOpaqueToken {
  const token = generateOneTimeToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = addHours(now, ACTIVATION_TOKEN_TTL_HOURS);

  return {
    token,
    tokenHash,
    expiresAt,
  };
}

export function createPasswordResetTokenPayload(now = new Date()): IssuedOpaqueToken {
  const token = generateOneTimeToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = addHours(now, PASSWORD_RESET_TOKEN_TTL_HOURS);

  return {
    token,
    tokenHash,
    expiresAt,
  };
}

export function assertConfirmedStrongPassword(newPassword: string, confirmPassword: string) {
  if (!isStrongPassword(newPassword)) {
    throw new AuthAccountError(
      400,
      ERROR_CODES.INVALID_PASSWORD,
      PASSWORD_POLICY_ERROR_MESSAGE_EN,
    );
  }

  if (newPassword !== confirmPassword) {
    throw new AuthAccountError(400, ERROR_CODES.INVALID_PASSWORD, "Confirm password does not match.");
  }
}

export function assertStrongPasswordInput(newPassword: string) {
  if (!isStrongPassword(newPassword)) {
    throw new AuthAccountError(
      400,
      ERROR_CODES.INVALID_PASSWORD,
      PASSWORD_POLICY_ERROR_MESSAGE_EN,
    );
  }
}

export function assertUsableActivationTokenRecord(
  record: ActivationTokenRecordLike | undefined,
  now: Date,
): UsableActivationTokenRecord {
  if (!record) {
    throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Activation token is invalid.");
  }

  const normalizedRecord = normalizeTokenDates(record);

  if (normalizedRecord.usedAt) {
    throw new AuthAccountError(410, ERROR_CODES.TOKEN_USED, "Activation link has already been used.");
  }

  if (
    Number.isNaN(normalizedRecord.expiresAt.getTime())
    || normalizedRecord.expiresAt.getTime() <= now.getTime()
  ) {
    throw new AuthAccountError(410, ERROR_CODES.TOKEN_EXPIRED, "Activation link has expired.");
  }

  if (normalizedRecord.isBanned) {
    throw new AuthAccountError(
      409,
      ERROR_CODES.ACCOUNT_UNAVAILABLE,
      "Account activation is not available for this account.",
    );
  }

  if (normalizeAccountStatus(normalizedRecord.status, "pending_activation") !== "pending_activation") {
    throw new AuthAccountError(
      409,
      ERROR_CODES.ACCOUNT_UNAVAILABLE,
      "Account activation is no longer available.",
    );
  }

  if (!isManageableUserRole(normalizedRecord.role)) {
    throw new AuthAccountError(
      409,
      ERROR_CODES.ACCOUNT_UNAVAILABLE,
      "Account activation is not available for this account.",
    );
  }

  return normalizedRecord;
}

export function assertUsablePasswordResetTokenRecord(
  record: PasswordResetTokenRecordLike | undefined,
  now: Date,
): UsablePasswordResetTokenRecord {
  if (!record) {
    throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Password reset token is invalid.");
  }

  const normalizedRecord = normalizeTokenDates(record);

  if (normalizedRecord.usedAt) {
    throw new AuthAccountError(410, ERROR_CODES.TOKEN_USED, "Password reset link has already been used.");
  }

  if (
    Number.isNaN(normalizedRecord.expiresAt.getTime())
    || normalizedRecord.expiresAt.getTime() <= now.getTime()
  ) {
    throw new AuthAccountError(410, ERROR_CODES.TOKEN_EXPIRED, "Password reset link has expired.");
  }

  if (!isManageableUserRole(normalizedRecord.role)) {
    throw new AuthAccountError(
      409,
      ERROR_CODES.ACCOUNT_UNAVAILABLE,
      "Password reset is not available for this account.",
    );
  }

  if (normalizeAccountStatus(normalizedRecord.status, "active") === "pending_activation") {
    throw new AuthAccountError(
      409,
      ERROR_CODES.ACCOUNT_UNAVAILABLE,
      "Pending accounts must complete activation before password reset.",
    );
  }

  return normalizedRecord;
}
