import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL } from "../lib/collection-rollup-refresh-notification";
import { buildCollectionRecordDailyRollupWhereSql } from "./collection-record-query-utils";
import {
  mapCollectionRecordRowToDailyRollupSlice,
  normalizeCollectionRecordDailyRollupSlice,
} from "./collection-record-rollup-slice-utils";
import type {
  CollectionRecordDailyRollupRefreshQueueSnapshot,
  CollectionRecordDailyRollupSlice,
  CollectionRollupFreshnessSnapshot,
  CollectionRollupFreshnessStatus,
  NormalizedCollectionRecordDailyRollupSlice,
} from "./collection-record-rollup-types";

export function mapCollectionRecordDailyRollupRefreshQueueSnapshotRow(
  row: Record<string, unknown> | null | undefined,
): CollectionRecordDailyRollupRefreshQueueSnapshot {
  return {
    pendingCount: Number(row?.pending_count || 0),
    runningCount: Number(row?.running_count || 0),
    retryCount: Number(row?.retry_count || 0),
    oldestPendingAgeMs: Math.max(0, Number(row?.oldest_pending_age_ms || 0)),
  };
}

export function resolveCollectionRollupFreshnessStatus(
  snapshot: CollectionRecordDailyRollupRefreshQueueSnapshot,
): CollectionRollupFreshnessStatus {
  if (
    snapshot.retryCount > 0
    || snapshot.oldestPendingAgeMs >= 120_000
    || snapshot.pendingCount >= 15
  ) {
    return "stale";
  }
  if (
    snapshot.pendingCount > 0
    || snapshot.oldestPendingAgeMs >= 30_000
  ) {
    return "warming";
  }
  return "fresh";
}

export async function getCollectionRecordDailyRollupRefreshQueueSnapshot(
  now: Date = new Date(),
): Promise<CollectionRecordDailyRollupRefreshQueueSnapshot> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS pending_count,
      COUNT(*) FILTER (WHERE status = 'running')::int AS running_count,
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(last_error, '')), '') IS NOT NULL)::int AS retry_count,
      COALESCE(
        MAX(
          GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - requested_at)) * 1000)
          )::bigint
        ),
        0
      )::bigint AS oldest_pending_age_ms
    FROM public.collection_record_daily_rollup_refresh_queue
  `);

  return mapCollectionRecordDailyRollupRefreshQueueSnapshotRow(
    (result.rows?.[0] || null) as Record<string, unknown> | null,
  );
}

export async function getCollectionRecordDailyRollupFreshnessSnapshot(
  filters?: {
    from?: string;
    to?: string;
    createdByLogin?: string;
    nicknames?: string[];
  },
  now: Date = new Date(),
): Promise<CollectionRollupFreshnessSnapshot> {
  const whereSql = buildCollectionRecordDailyRollupWhereSql(filters);
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS pending_count,
      COUNT(*) FILTER (WHERE status = 'running')::int AS running_count,
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(last_error, '')), '') IS NOT NULL)::int AS retry_count,
      COALESCE(
        MAX(
          GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - requested_at)) * 1000)
          )::bigint
        ),
        0
      )::bigint AS oldest_pending_age_ms
    FROM public.collection_record_daily_rollup_refresh_queue
    ${whereSql}
  `);
  const snapshot = mapCollectionRecordDailyRollupRefreshQueueSnapshotRow(
    (result.rows?.[0] || null) as Record<string, unknown> | null,
  );

  return {
    ...snapshot,
    status: resolveCollectionRollupFreshnessStatus(snapshot),
  };
}

export async function hasPendingCollectionRecordDailyRollupSlices(filters?: {
  from?: string | undefined;
  to?: string | undefined;
  createdByLogin?: string | undefined;
  nicknames?: string[] | undefined;
}): Promise<boolean> {
  const whereSql = buildCollectionRecordDailyRollupWhereSql(filters);
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM public.collection_record_daily_rollup_refresh_queue
      ${whereSql}
    ) AS has_pending
  `);
  return Boolean((result.rows?.[0] as { has_pending?: boolean } | undefined)?.has_pending);
}

export async function markRunningCollectionRecordDailyRollupRefreshSlicesQueued(): Promise<void> {
  const result = await db.execute(sql`
    WITH updated AS (
      UPDATE public.collection_record_daily_rollup_refresh_queue
      SET
        status = 'queued',
        updated_at = now(),
        next_attempt_at = now(),
        last_error = COALESCE(last_error, 'Rollup refresh was interrupted by a server restart before completion.')
      WHERE status = 'running'
      RETURNING 1
    )
    SELECT COUNT(*)::int AS affected_count
    FROM updated
  `);
  const affectedCount = Number((result.rows?.[0] as Record<string, unknown> | undefined)?.affected_count || 0);
  if (affectedCount > 0) {
    await db.execute(sql`
      SELECT pg_notify(${COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL}, 'queued')
    `);
  }
}

export async function requeueCollectionRecordDailyRollupRefreshFailures(): Promise<number> {
  const result = await db.execute(sql`
    WITH updated AS (
      UPDATE public.collection_record_daily_rollup_refresh_queue
      SET
        status = 'queued',
        updated_at = now(),
        next_attempt_at = now()
      WHERE NULLIF(BTRIM(COALESCE(last_error, '')), '') IS NOT NULL
      RETURNING 1
    )
    SELECT COUNT(*)::int AS affected_count
    FROM updated
  `);
  const affectedCount = Number((result.rows?.[0] as Record<string, unknown> | undefined)?.affected_count || 0);
  if (affectedCount > 0) {
    await db.execute(sql`
      SELECT pg_notify(${COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL}, 'queued')
    `);
  }
  return affectedCount;
}

export async function clearCollectionRecordDailyRollupRefreshQueue(): Promise<void> {
  await db.execute(sql`DELETE FROM public.collection_record_daily_rollup_refresh_queue`);
}

export async function claimNextCollectionRecordDailyRollupRefreshSlice(
  now: Date = new Date(),
): Promise<NormalizedCollectionRecordDailyRollupSlice | null> {
  const result = await db.execute(sql`
    WITH next_slice AS (
      SELECT payment_date, created_by_login, collection_staff_nickname
      FROM public.collection_record_daily_rollup_refresh_queue
      WHERE status = 'queued'
        AND next_attempt_at <= ${now}
      ORDER BY updated_at ASC, requested_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.collection_record_daily_rollup_refresh_queue queue
    SET
      status = 'running',
      updated_at = now(),
      attempt_count = COALESCE(queue.attempt_count, 0) + 1,
      last_error = null
    FROM next_slice
    WHERE queue.payment_date = next_slice.payment_date
      AND queue.created_by_login = next_slice.created_by_login
      AND queue.collection_staff_nickname = next_slice.collection_staff_nickname
    RETURNING
      queue.payment_date,
      queue.created_by_login,
      queue.collection_staff_nickname
  `);

  return mapCollectionRecordRowToDailyRollupSlice(
    (result.rows?.[0] || null) as Record<string, unknown> | null,
  );
}

export async function completeCollectionRecordDailyRollupRefreshSlice(
  slice: CollectionRecordDailyRollupSlice | null | undefined,
): Promise<void> {
  const normalized = normalizeCollectionRecordDailyRollupSlice(slice);
  if (!normalized) return;

  await db.execute(sql`
    DELETE FROM public.collection_record_daily_rollup_refresh_queue
    WHERE payment_date = ${normalized.paymentDate}::date
      AND created_by_login = ${normalized.createdByLogin}
      AND collection_staff_nickname = ${normalized.collectionStaffNickname}
  `);
}

export async function failCollectionRecordDailyRollupRefreshSlice(params: {
  slice: CollectionRecordDailyRollupSlice | null | undefined;
  errorMessage: string;
  nextAttemptAt: Date;
}): Promise<void> {
  const normalized = normalizeCollectionRecordDailyRollupSlice(params.slice);
  if (!normalized) return;

  await db.execute(sql`
    UPDATE public.collection_record_daily_rollup_refresh_queue
    SET
      status = 'queued',
      updated_at = now(),
      next_attempt_at = ${params.nextAttemptAt},
      last_error = ${params.errorMessage}
    WHERE payment_date = ${normalized.paymentDate}::date
      AND created_by_login = ${normalized.createdByLogin}
      AND collection_staff_nickname = ${normalized.collectionStaffNickname}
  `);
}
