import crypto from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type {
  AccountActivationToken,
  PasswordResetRequest,
} from "../../shared/schema-postgres";
import {
  accountActivationTokens,
  passwordResetRequests,
  users,
} from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import type {
  ActivationTokenRecord,
  PasswordResetTokenRecord,
} from "./auth-repository-types";

function asUtcTimestamp(columnSql: ReturnType<typeof sql>) {
  return sql`(${columnSql} AT TIME ZONE 'UTC')`;
}

export async function createActivationToken(params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdBy: string;
}): Promise<AccountActivationToken> {
  const record = {
    id: crypto.randomUUID(),
    userId: params.userId,
    tokenHash: params.tokenHash,
    expiresAt: params.expiresAt,
    usedAt: null,
    createdBy: params.createdBy,
    createdAt: new Date(),
  };

  await db.insert(accountActivationTokens).values(record);
  return record;
}

export async function invalidateUnusedActivationTokens(userId: string): Promise<void> {
  await db
    .update(accountActivationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(accountActivationTokens.userId, userId),
        isNull(accountActivationTokens.usedAt),
      ),
    );
}

export async function getActivationTokenRecordByHash(
  tokenHash: string,
): Promise<ActivationTokenRecord | undefined> {
  const normalizedHash = String(tokenHash || "").trim();
  if (!normalizedHash) {
    return undefined;
  }

  const result = await db.execute(sql`
    SELECT
      t.id as "tokenId",
      ${asUtcTimestamp(sql`t.expires_at`)} as "expiresAt",
      ${asUtcTimestamp(sql`t.used_at`)} as "usedAt",
      ${asUtcTimestamp(sql`t.created_at`)} as "createdAt",
      u.id as "userId",
      u.username,
      u.full_name as "fullName",
      u.email,
      u.role,
      u.status,
      u.is_banned as "isBanned",
      u.activated_at as "activatedAt"
    FROM public.account_activation_tokens t
    INNER JOIN public.users u ON u.id = t.user_id
    WHERE t.token_hash = ${normalizedHash}
    ORDER BY t.created_at DESC
    LIMIT 1
  `);

  return result.rows[0] as ActivationTokenRecord | undefined;
}

export async function consumeActivationTokenById(params: {
  tokenId: string;
  now?: Date;
}): Promise<boolean> {
  const tokenId = String(params.tokenId || "").trim();
  if (!tokenId) {
    return false;
  }

  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const result = await db.execute(sql`
    UPDATE public.account_activation_tokens
    SET used_at = ${nowIso}
    WHERE id = ${tokenId}
      AND used_at IS NULL
      AND (expires_at AT TIME ZONE 'UTC') > ${nowIso}
    RETURNING id
  `);

  return (result.rows || []).length > 0;
}

export async function createPasswordResetRequest(params: {
  userId: string;
  requestedByUser: string | null;
  approvedBy?: string | null;
  resetType?: string;
  tokenHash?: string | null;
  expiresAt?: Date | null;
  usedAt?: Date | null;
}): Promise<PasswordResetRequest> {
  const record = {
    id: crypto.randomUUID(),
    userId: params.userId,
    requestedByUser: params.requestedByUser,
    approvedBy: params.approvedBy ?? null,
    resetType: params.resetType ?? "email_link",
    tokenHash: params.tokenHash ?? null,
    expiresAt: params.expiresAt ?? null,
    usedAt: params.usedAt ?? null,
    createdAt: new Date(),
  };

  await db.insert(passwordResetRequests).values(record);
  return record;
}

export async function updatePasswordResetRequest(params: {
  requestId: string;
  approvedBy?: string | null;
  resetType?: string;
  usedAt?: Date | null;
  tokenHash?: string | null;
  expiresAt?: Date | null;
}): Promise<void> {
  await db
    .update(passwordResetRequests)
    .set({
      approvedBy: params.approvedBy,
      resetType: params.resetType,
      tokenHash: params.tokenHash ?? null,
      expiresAt: params.expiresAt ?? null,
      usedAt: params.usedAt ?? null,
    })
    .where(eq(passwordResetRequests.id, params.requestId));
}

export async function resolvePendingPasswordResetRequestsForUser(params: {
  userId: string;
  approvedBy: string;
  resetType: string;
  usedAt?: Date | null;
}): Promise<void> {
  await db
    .update(passwordResetRequests)
    .set({
      approvedBy: params.approvedBy,
      resetType: params.resetType,
      usedAt: params.usedAt ?? new Date(),
    })
    .where(
      and(
        eq(passwordResetRequests.userId, params.userId),
        isNull(passwordResetRequests.approvedBy),
        isNull(passwordResetRequests.usedAt),
      ),
    );
}

export async function invalidateUnusedPasswordResetTokens(userId: string, now = new Date()): Promise<void> {
  await db
    .update(passwordResetRequests)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResetRequests.userId, userId),
        isNull(passwordResetRequests.usedAt),
        sql`${passwordResetRequests.tokenHash} IS NOT NULL`,
      ),
    );
}

export async function getPasswordResetTokenRecordByHash(
  tokenHash: string,
): Promise<PasswordResetTokenRecord | undefined> {
  const normalizedHash = String(tokenHash || "").trim();
  if (!normalizedHash) {
    return undefined;
  }

  const result = await db.execute(sql`
    SELECT
      r.id as "requestId",
      r.user_id as "userId",
      ${asUtcTimestamp(sql`r.expires_at`)} as "expiresAt",
      ${asUtcTimestamp(sql`r.used_at`)} as "usedAt",
      ${asUtcTimestamp(sql`r.created_at`)} as "createdAt",
      u.username,
      u.full_name as "fullName",
      u.email,
      u.role,
      u.status,
      u.is_banned as "isBanned",
      u.activated_at as "activatedAt"
    FROM public.password_reset_requests r
    INNER JOIN public.users u ON u.id = r.user_id
    WHERE r.token_hash = ${normalizedHash}
    ORDER BY r.created_at DESC
    LIMIT 1
  `);

  return (result.rows?.[0] || undefined) as PasswordResetTokenRecord | undefined;
}

export async function consumePasswordResetRequestById(params: {
  requestId: string;
  now?: Date;
}): Promise<boolean> {
  const requestId = String(params.requestId || "").trim();
  if (!requestId) {
    return false;
  }

  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const result = await db.execute(sql`
    UPDATE public.password_reset_requests
    SET used_at = ${nowIso}
    WHERE id = ${requestId}
      AND used_at IS NULL
      AND (expires_at AT TIME ZONE 'UTC') > ${nowIso}
    RETURNING id
  `);

  return (result.rows || []).length > 0;
}
