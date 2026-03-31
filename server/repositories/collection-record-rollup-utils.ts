import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL } from "../lib/collection-rollup-refresh-notification";
import {
  buildCollectionRecordDailyRollupWhereSql,
  mapCollectionAggregateRow,
} from "./collection-record-query-utils";

type CollectionRepositoryExecutor = Pick<typeof db, "execute">;

export type CollectionRecordDailyRollupSlice = {
  paymentDate?: string | null;
  createdByLogin?: string | null;
  collectionStaffNickname?: string | null;
};

export type CollectionRecordDailyRollupRefreshQueueSnapshot = {
  pendingCount: number;
  runningCount: number;
  retryCount: number;
  oldestPendingAgeMs: number;
};

export type CollectionRollupFreshnessStatus = "fresh" | "warming" | "stale";

export type CollectionRollupFreshnessSnapshot = CollectionRecordDailyRollupRefreshQueueSnapshot & {
  status: CollectionRollupFreshnessStatus;
};

export function normalizeCollectionRecordDailyRollupSlice(
  slice: CollectionRecordDailyRollupSlice | null | undefined,
): Required<CollectionRecordDailyRollupSlice> | null {
  const paymentDate = String(slice?.paymentDate || "").trim();
  const createdByLogin = String(slice?.createdByLogin || "").trim();
  const collectionStaffNickname = String(slice?.collectionStaffNickname || "").trim();
  if (!paymentDate || !createdByLogin || !collectionStaffNickname) {
    return null;
  }

  return {
    paymentDate,
    createdByLogin,
    collectionStaffNickname,
  };
}

export function mapCollectionRecordRowToDailyRollupSlice(
  row: Record<string, unknown> | null | undefined,
): Required<CollectionRecordDailyRollupSlice> | null {
  return normalizeCollectionRecordDailyRollupSlice({
    paymentDate: String(row?.payment_date || row?.paymentDate || ""),
    createdByLogin: String(row?.created_by_login || row?.createdByLogin || ""),
    collectionStaffNickname: String(row?.collection_staff_nickname || row?.collectionStaffNickname || ""),
  });
}

export async function refreshCollectionRecordDailyRollupSlice(
  executor: CollectionRepositoryExecutor,
  slice: CollectionRecordDailyRollupSlice | null | undefined,
): Promise<void> {
  const normalized = normalizeCollectionRecordDailyRollupSlice(slice);
  if (!normalized) {
    return;
  }

  const aggregateResult = await executor.execute(sql`
    SELECT
      COUNT(*)::int AS total_records,
      COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
    FROM public.collection_records
    WHERE payment_date = ${normalized.paymentDate}::date
      AND created_by_login = ${normalized.createdByLogin}
      AND collection_staff_nickname = ${normalized.collectionStaffNickname}
  `);
  const aggregate = mapCollectionAggregateRow(aggregateResult.rows?.[0]);

  if (aggregate.totalRecords <= 0) {
    await executor.execute(sql`
      DELETE FROM public.collection_record_daily_rollups
      WHERE payment_date = ${normalized.paymentDate}::date
        AND created_by_login = ${normalized.createdByLogin}
        AND collection_staff_nickname = ${normalized.collectionStaffNickname}
    `);
    await refreshCollectionRecordMonthlyRollupSlice(executor, normalized);
    return;
  }

  await executor.execute(sql`
    INSERT INTO public.collection_record_daily_rollups (
      payment_date,
      created_by_login,
      collection_staff_nickname,
      total_records,
      total_amount,
      updated_at
    )
    VALUES (
      ${normalized.paymentDate}::date,
      ${normalized.createdByLogin},
      ${normalized.collectionStaffNickname},
      ${aggregate.totalRecords},
      ${aggregate.totalAmount},
      now()
    )
    ON CONFLICT (payment_date, created_by_login, collection_staff_nickname)
    DO UPDATE SET
      total_records = EXCLUDED.total_records,
      total_amount = EXCLUDED.total_amount,
      updated_at = now()
  `);
  await refreshCollectionRecordMonthlyRollupSlice(executor, normalized);
}

export async function refreshCollectionRecordDailyRollupSlices(
  executor: CollectionRepositoryExecutor,
  slices: Array<CollectionRecordDailyRollupSlice | null | undefined>,
): Promise<void> {
  const pending = new Map<string, Required<CollectionRecordDailyRollupSlice>>();
  for (const slice of slices) {
    const normalized = normalizeCollectionRecordDailyRollupSlice(slice);
    if (!normalized) continue;
    pending.set(
      `${normalized.paymentDate}::${normalized.createdByLogin}::${normalized.collectionStaffNickname}`,
      normalized,
    );
  }

  for (const slice of pending.values()) {
    await refreshCollectionRecordDailyRollupSlice(executor, slice);
  }
}

export async function rebuildCollectionRecordDailyRollups(
  executor: CollectionRepositoryExecutor,
): Promise<void> {
  await executor.execute(sql`
    DELETE FROM public.collection_record_daily_rollups rollup
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.collection_records record
      WHERE record.payment_date = rollup.payment_date
        AND record.created_by_login = rollup.created_by_login
        AND record.collection_staff_nickname = rollup.collection_staff_nickname
    )
  `);
  await executor.execute(sql`
    INSERT INTO public.collection_record_daily_rollups (
      payment_date,
      created_by_login,
      collection_staff_nickname,
      total_records,
      total_amount,
      updated_at
    )
    SELECT
      payment_date,
      created_by_login,
      collection_staff_nickname,
      COUNT(*)::int,
      COALESCE(SUM(amount), 0)::numeric(14,2),
      now()
    FROM public.collection_records
    GROUP BY payment_date, created_by_login, collection_staff_nickname
    ON CONFLICT (payment_date, created_by_login, collection_staff_nickname)
    DO UPDATE SET
      total_records = EXCLUDED.total_records,
      total_amount = EXCLUDED.total_amount,
      updated_at = now()
  `);
  await rebuildCollectionRecordMonthlyRollups(executor);
}

export async function refreshCollectionRecordMonthlyRollupSlice(
  executor: CollectionRepositoryExecutor,
  slice: CollectionRecordDailyRollupSlice | null | undefined,
): Promise<void> {
  const normalized = normalizeCollectionRecordDailyRollupSlice(slice);
  if (!normalized) {
    return;
  }

  const paymentDate = new Date(`${normalized.paymentDate}T00:00:00.000Z`);
  if (Number.isNaN(paymentDate.getTime())) {
    return;
  }
  const year = paymentDate.getUTCFullYear();
  const month = paymentDate.getUTCMonth() + 1;

  const aggregateResult = await executor.execute(sql`
    SELECT
      COALESCE(SUM(total_records), 0)::int AS total_records,
      COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount
    FROM public.collection_record_daily_rollups
    WHERE payment_date >= make_date(${year}, ${month}, 1)
      AND payment_date < (make_date(${year}, ${month}, 1) + interval '1 month')
      AND created_by_login = ${normalized.createdByLogin}
      AND collection_staff_nickname = ${normalized.collectionStaffNickname}
  `);
  const aggregate = mapCollectionAggregateRow(aggregateResult.rows?.[0]);

  if (aggregate.totalRecords <= 0) {
    await executor.execute(sql`
      DELETE FROM public.collection_record_monthly_rollups
      WHERE year = ${year}
        AND month = ${month}
        AND created_by_login = ${normalized.createdByLogin}
        AND collection_staff_nickname = ${normalized.collectionStaffNickname}
    `);
    return;
  }

  await executor.execute(sql`
    INSERT INTO public.collection_record_monthly_rollups (
      year,
      month,
      created_by_login,
      collection_staff_nickname,
      total_records,
      total_amount,
      updated_at
    )
    VALUES (
      ${year},
      ${month},
      ${normalized.createdByLogin},
      ${normalized.collectionStaffNickname},
      ${aggregate.totalRecords},
      ${aggregate.totalAmount},
      now()
    )
    ON CONFLICT (year, month, created_by_login, collection_staff_nickname)
    DO UPDATE SET
      total_records = EXCLUDED.total_records,
      total_amount = EXCLUDED.total_amount,
      updated_at = now()
  `);
}

export async function rebuildCollectionRecordMonthlyRollups(
  executor: CollectionRepositoryExecutor,
): Promise<void> {
  await executor.execute(sql`
    DELETE FROM public.collection_record_monthly_rollups rollup
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.collection_record_daily_rollups daily
      WHERE daily.created_by_login = rollup.created_by_login
        AND daily.collection_staff_nickname = rollup.collection_staff_nickname
        AND EXTRACT(YEAR FROM daily.payment_date)::int = rollup.year
        AND EXTRACT(MONTH FROM daily.payment_date)::int = rollup.month
    )
  `);
  await executor.execute(sql`
    INSERT INTO public.collection_record_monthly_rollups (
      year,
      month,
      created_by_login,
      collection_staff_nickname,
      total_records,
      total_amount,
      updated_at
    )
    SELECT
      EXTRACT(YEAR FROM payment_date)::int AS year,
      EXTRACT(MONTH FROM payment_date)::int AS month,
      created_by_login,
      collection_staff_nickname,
      COALESCE(SUM(total_records), 0)::int,
      COALESCE(SUM(total_amount), 0)::numeric(14,2),
      now()
    FROM public.collection_record_daily_rollups
    GROUP BY 1, 2, 3, 4
    ON CONFLICT (year, month, created_by_login, collection_staff_nickname)
    DO UPDATE SET
      total_records = EXCLUDED.total_records,
      total_amount = EXCLUDED.total_amount,
      updated_at = now()
  `);
}

export async function enqueueCollectionRecordDailyRollupSlices(
  executor: CollectionRepositoryExecutor,
  slices: Array<CollectionRecordDailyRollupSlice | null | undefined>,
): Promise<void> {
  const pending = new Map<string, Required<CollectionRecordDailyRollupSlice>>();
  for (const slice of slices) {
    const normalized = normalizeCollectionRecordDailyRollupSlice(slice);
    if (!normalized) continue;
    pending.set(
      `${normalized.paymentDate}::${normalized.createdByLogin}::${normalized.collectionStaffNickname}`,
      normalized,
    );
  }

  for (const slice of pending.values()) {
    await executor.execute(sql`
      INSERT INTO public.collection_record_daily_rollup_refresh_queue (
        payment_date,
        created_by_login,
        collection_staff_nickname,
        status,
        requested_at,
        updated_at,
        next_attempt_at,
        attempt_count,
        last_error
      )
      VALUES (
        ${slice.paymentDate}::date,
        ${slice.createdByLogin},
        ${slice.collectionStaffNickname},
        'queued',
        now(),
        now(),
        now(),
        0,
        null
      )
      ON CONFLICT (payment_date, created_by_login, collection_staff_nickname)
      DO UPDATE SET
        status = 'queued',
        updated_at = now(),
        next_attempt_at = now(),
        last_error = null
    `);
  }

  if (pending.size > 0) {
    await executor.execute(sql`
      SELECT pg_notify(${COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL}, 'queued')
    `);
  }
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
  const row = (result.rows?.[0] || null) as Record<string, unknown> | null;

  return {
    pendingCount: Number(row?.pending_count || 0),
    runningCount: Number(row?.running_count || 0),
    retryCount: Number(row?.retry_count || 0),
    oldestPendingAgeMs: Math.max(0, Number(row?.oldest_pending_age_ms || 0)),
  };
}

function resolveCollectionRollupFreshnessStatus(
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
  const baseSnapshot = {
    pendingCount: Number((result.rows?.[0] as Record<string, unknown> | undefined)?.pending_count || 0),
    runningCount: Number((result.rows?.[0] as Record<string, unknown> | undefined)?.running_count || 0),
    retryCount: Number((result.rows?.[0] as Record<string, unknown> | undefined)?.retry_count || 0),
    oldestPendingAgeMs: Math.max(
      0,
      Number((result.rows?.[0] as Record<string, unknown> | undefined)?.oldest_pending_age_ms || 0),
    ),
  };

  return {
    ...baseSnapshot,
    status: resolveCollectionRollupFreshnessStatus(baseSnapshot),
  };
}

export async function hasPendingCollectionRecordDailyRollupSlices(filters?: {
  from?: string;
  to?: string;
  createdByLogin?: string;
  nicknames?: string[];
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
): Promise<Required<CollectionRecordDailyRollupSlice> | null> {
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
