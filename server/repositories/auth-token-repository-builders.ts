import crypto from "crypto";
import type {
  AccountActivationToken,
  PasswordResetRequest,
} from "../../shared/schema-postgres";
import type {
  CreateActivationTokenParams,
  CreatePasswordResetRequestParams,
  UpdatePasswordResetRequestParams,
} from "./auth-token-repository-types";

export function buildActivationTokenInsertRecord(
  params: CreateActivationTokenParams,
  now = new Date(),
): AccountActivationToken {
  return {
    id: crypto.randomUUID(),
    userId: params.userId,
    tokenHash: params.tokenHash,
    expiresAt: params.expiresAt,
    usedAt: null,
    createdBy: params.createdBy,
    createdAt: now,
  };
}

export function buildPasswordResetRequestInsertRecord(
  params: CreatePasswordResetRequestParams,
  now = new Date(),
): PasswordResetRequest {
  return {
    id: crypto.randomUUID(),
    userId: params.userId,
    requestedByUser: params.requestedByUser,
    approvedBy: params.approvedBy ?? null,
    resetType: params.resetType ?? "email_link",
    tokenHash: params.tokenHash ?? null,
    expiresAt: params.expiresAt ?? null,
    usedAt: params.usedAt ?? null,
    createdAt: now,
  };
}

export function buildPasswordResetRequestUpdateRecord(
  params: UpdatePasswordResetRequestParams,
) {
  return {
    approvedBy: params.approvedBy,
    resetType: params.resetType,
    tokenHash: params.tokenHash ?? null,
    expiresAt: params.expiresAt ?? null,
    usedAt: params.usedAt ?? null,
  };
}
