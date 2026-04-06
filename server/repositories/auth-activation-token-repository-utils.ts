import { and, eq, isNull, sql } from "drizzle-orm";
import { accountActivationTokens } from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import type { ActivationTokenRecord } from "./auth-repository-types";
import {
  asUtcTimestamp,
  buildActivationTokenInsertRecord,
  normalizeAuthTokenHash,
  resolveAuthTokenConsumptionState,
  type ConsumeActivationTokenParams,
  type CreateActivationTokenParams,
} from "./auth-token-repository-shared";

export async function createActivationToken(
  params: CreateActivationTokenParams,
) {
  const record = buildActivationTokenInsertRecord(params);
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
  const normalizedHash = normalizeAuthTokenHash(tokenHash);
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

export async function consumeActivationTokenById(
  params: ConsumeActivationTokenParams,
): Promise<boolean> {
  const consumption = resolveAuthTokenConsumptionState(params.tokenId, params.now);
  if (!consumption) {
    return false;
  }

  const result = await db.execute(sql`
    UPDATE public.account_activation_tokens
    SET used_at = ${consumption.nowIso}
    WHERE id = ${consumption.id}
      AND used_at IS NULL
      AND (expires_at AT TIME ZONE 'UTC') > ${consumption.nowIso}
    RETURNING id
  `);

  return (result.rows || []).length > 0;
}
