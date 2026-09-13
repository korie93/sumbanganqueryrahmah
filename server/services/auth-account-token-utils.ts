import { addHours } from "date-fns";
import { isManageableUserRole, normalizeAccountStatus } from "../auth/account-lifecycle";
import { getCredentialPasswordValidationError } from "../../shared/password-policy";
import {
  generateOneTimeToken,
  getOpaqueTokenHashCandidates,
  hashOpaqueToken,
} from "../auth/passwords";
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

export type OpaqueTokenRecordLookupResult<TRecord> = {
  record: TRecord;
  tokenHash: string;
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
  assertStrongPasswordInput(newPassword);

  if (newPassword !== confirmPassword) {
    throw new AuthAccountError(400, ERROR_CODES.PASSWORD_CONFIRMATION_MISMATCH, "Passwords do not match.");
  }
}

export function assertStrongPasswordInput(newPassword: string) {
  const issue = getCredentialPasswordValidationError(newPassword);
  if (issue) throw new AuthAccountError(400, issue.code, issue.message);
}

export async function findOpaqueTokenRecordByHashCandidates<TRecord>(
  rawToken: string,
  lookup: (tokenHash: string) => Promise<TRecord | undefined>,
): Promise<OpaqueTokenRecordLookupResult<TRecord> | null> {
  for (const tokenHash of getOpaqueTokenHashCandidates(rawToken)) {
    const record = await lookup(tokenHash);
    if (record) {
      return { record, tokenHash };
    }
  }

  return null;
}

export function assertUsableActivationTokenRecord(
  record: ActivationTokenRecordLike | undefined,
  now: Date,
): UsableActivationTokenRecord {
  if (!record) {
    throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Activation token is invalid.");
  }

  const normalizedRecord = normalizeTokenDates(record);

  // Only someone holding a genuine high-entropy link reaches these messages.
  if (normalizedRecord.status === "active" && normalizedRecord.activatedAt) {
    throw new AuthAccountError(409, ERROR_CODES.ACCOUNT_ALREADY_ACTIVATED, "Account already activated. Please sign in or request a password reset.");
  }
  if (normalizedRecord.usedAt) {
    if (normalizedRecord.status === "pending_activation") {
      throw new AuthAccountError(410, ERROR_CODES.ACTIVATION_TOKEN_SUPERSEDED, "This activation link was replaced. Open the newest activation email or ask the administrator to resend it.");
    }
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

  if (!isManageableUserRole(normalizedRecord.role) || normalizedRecord.status === "deleted") {
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

  if (!isManageableUserRole(normalizedRecord.role) || normalizedRecord.status === "deleted") {
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
