import crypto from "crypto";
import { sql } from "drizzle-orm";
import type {
  AccountActivationToken,
  PasswordResetRequest,
} from "../../shared/schema-postgres";

export type CreateActivationTokenParams = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdBy: string;
};

export type ConsumeActivationTokenParams = {
  tokenId: string;
  now?: Date;
};

export type CreatePasswordResetRequestParams = {
  userId: string;
  requestedByUser: string | null;
  approvedBy?: string | null | undefined;
  resetType?: string | undefined;
  tokenHash?: string | null | undefined;
  expiresAt?: Date | null | undefined;
  usedAt?: Date | null | undefined;
};

export type UpdatePasswordResetRequestParams = {
  requestId: string;
  approvedBy?: string | null | undefined;
  resetType?: string | undefined;
  usedAt?: Date | null | undefined;
  tokenHash?: string | null | undefined;
  expiresAt?: Date | null | undefined;
};

export type ResolvePendingPasswordResetRequestsForUserParams = {
  userId: string;
  approvedBy: string;
  resetType: string;
  usedAt?: Date | null;
};

export type ConsumePasswordResetRequestParams = {
  requestId: string;
  now?: Date;
};

export function asUtcTimestamp(columnSql: ReturnType<typeof sql>) {
  return sql`${columnSql}`;
}

export function normalizeAuthTokenHash(tokenHash: string): string {
  return String(tokenHash || "").trim();
}

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

export function resolveAuthTokenConsumptionState<TId extends string>(
  idRaw: TId,
  now?: Date,
): { id: string; now: Date; nowIso: string } | null {
  const id = String(idRaw || "").trim();
  if (!id) {
    return null;
  }

  const resolvedNow = now ?? new Date();
  return {
    id,
    now: resolvedNow,
    nowIso: resolvedNow.toISOString(),
  };
}
