import { and, eq, isNull, sql } from "drizzle-orm";
import { passwordResetRequests } from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import type { PasswordResetTokenRecord } from "./auth-repository-types";
import {
  asUtcTimestamp,
  buildPasswordResetRequestInsertRecord,
  buildPasswordResetRequestUpdateRecord,
  normalizeAuthTokenHash,
  resolveAuthTokenConsumptionState,
  type ConsumePasswordResetRequestParams,
  type CreatePasswordResetRequestParams,
  type ResolvePendingPasswordResetRequestsForUserParams,
  type UpdatePasswordResetRequestParams,
} from "./auth-token-repository-shared";

export async function createPasswordResetRequest(
  params: CreatePasswordResetRequestParams,
) {
  const record = buildPasswordResetRequestInsertRecord(params);
  await db.insert(passwordResetRequests).values(record);
  return record;
}

export async function updatePasswordResetRequest(
  params: UpdatePasswordResetRequestParams,
): Promise<void> {
  await db
    .update(passwordResetRequests)
    .set(buildPasswordResetRequestUpdateRecord(params))
    .where(eq(passwordResetRequests.id, params.requestId));
}

export async function resolvePendingPasswordResetRequestsForUser(
  params: ResolvePendingPasswordResetRequestsForUserParams,
): Promise<void> {
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

export async function invalidateUnusedPasswordResetTokens(
  userId: string,
  now = new Date(),
): Promise<void> {
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
  const normalizedHash = normalizeAuthTokenHash(tokenHash);
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

export async function consumePasswordResetRequestById(
  params: ConsumePasswordResetRequestParams,
): Promise<boolean> {
  const consumption = resolveAuthTokenConsumptionState(params.requestId, params.now);
  if (!consumption) {
    return false;
  }

  const result = await db.execute(sql`
    UPDATE public.password_reset_requests
    SET used_at = ${consumption.nowIso}
    WHERE id = ${consumption.id}
      AND used_at IS NULL
      AND (expires_at AT TIME ZONE 'UTC') > ${consumption.nowIso}
    RETURNING id
  `);

  return (result.rows || []).length > 0;
}
