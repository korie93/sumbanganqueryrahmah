import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type {
  CollectionMonthlySummary,
  CollectionNicknameDailyAggregate,
  CollectionRecord,
  CollectionRecordReceipt,
  CreateCollectionRecordInput,
  CreateCollectionRecordReceiptInput,
  DeleteCollectionRecordOptions,
  UpdateCollectionRecordInput,
  UpdateCollectionRecordOptions,
} from "../storage-postgres";
import {
  buildCollectionMonthlySummaryWhereSql,
  buildCollectionRecordMonthlyRollupWhereSql,
  buildCollectionRecordDailyRollupWhereSql,
  buildCollectionRecordWhereSql,
  canUseCollectionRecordDailyRollups,
  collectCollectionReceiptPaths,
  extractCollectionRecordIds,
  mapCollectionAggregateRow,
  mapCollectionNicknameDailyAggregateRows,
  mapCollectionMonthlySummaryRows,
  sumCollectionRowAmounts,
} from "./collection-record-query-utils";
import {
  attachCollectionReceipts,
  createCollectionRecordReceiptRows,
  deleteAllCollectionRecordReceiptRows,
  deleteCollectionRecordReceiptRows,
} from "./collection-receipt-utils";
import { mapCollectionRecordRow } from "./collection-repository-mappers";

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

async function hasPendingCollectionRecordDailyRollupSlices(filters?: {
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
  await db.execute(sql`
    UPDATE public.collection_record_daily_rollup_refresh_queue
    SET
      status = 'queued',
      updated_at = now(),
      next_attempt_at = now(),
      last_error = COALESCE(last_error, 'Rollup refresh was interrupted by a server restart before completion.')
    WHERE status = 'running'
  `);
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
  return Number((result.rows?.[0] as Record<string, unknown> | undefined)?.affected_count || 0);
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

export async function createCollectionRecord(data: CreateCollectionRecordInput): Promise<CollectionRecord> {
  const id = randomUUID();
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO public.collection_records (
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at,
        updated_at
      )
      VALUES (
        ${id}::uuid,
        ${data.customerName},
        ${data.icNumber},
        ${data.customerPhone},
        ${data.accountNumber},
        ${data.batch},
        ${data.paymentDate}::date,
        ${data.amount},
        ${null},
        ${data.createdByLogin},
        ${data.collectionStaffNickname},
        ${data.collectionStaffNickname},
        now(),
        date_trunc('milliseconds', now())
      )
    `);

    await enqueueCollectionRecordDailyRollupSlices(tx, [{
      paymentDate: data.paymentDate,
      createdByLogin: data.createdByLogin,
      collectionStaffNickname: data.collectionStaffNickname,
    }]);

    const result = await tx.execute(sql`
      SELECT
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at,
        updated_at
      FROM public.collection_records
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const row = result.rows?.[0];
    if (!row) {
      throw new Error("Failed to load created collection record.");
    }

    const [created] = await attachCollectionReceipts(tx, [mapCollectionRecordRow(row)]);
    return created || mapCollectionRecordRow(row);
  });
}

export async function listCollectionRecords(filters?: {
  from?: string;
  to?: string;
  search?: string;
  createdByLogin?: string;
  nicknames?: string[];
  limit?: number;
  offset?: number;
}): Promise<CollectionRecord[]> {
  const whereSql = buildCollectionRecordWhereSql(filters);
  const parsedLimit = Number(filters?.limit);
  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.min(2000, Math.max(1, Math.floor(parsedLimit)))
    : 500;
  const parsedOffset = Number(filters?.offset);
  const safeOffset = Number.isFinite(parsedOffset)
    ? Math.max(0, Math.floor(parsedOffset))
    : 0;

  const result = await db.execute(sql`
    SELECT
      id,
      customer_name,
      ic_number,
      customer_phone,
      account_number,
      batch,
      payment_date,
      amount,
      receipt_file,
      created_by_login,
      collection_staff_nickname,
      staff_username,
      created_at,
      updated_at
    FROM public.collection_records
    ${whereSql}
    ORDER BY payment_date ASC, created_at ASC, id ASC
    LIMIT ${safeLimit}
    OFFSET ${safeOffset}
  `);

  const records = (result.rows || []).map((row: any) => mapCollectionRecordRow(row));
  return attachCollectionReceipts(db, records);
}

export async function summarizeCollectionRecords(filters?: {
  from?: string;
  to?: string;
  search?: string;
  createdByLogin?: string;
  nicknames?: string[];
}): Promise<{ totalRecords: number; totalAmount: number }> {
  if (
    canUseCollectionRecordDailyRollups(filters)
    && !(await hasPendingCollectionRecordDailyRollupSlices(filters))
  ) {
    const whereSql = buildCollectionRecordDailyRollupWhereSql(filters);
    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM(total_records), 0)::int AS total_records,
        COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_record_daily_rollups
      ${whereSql}
    `);

    return mapCollectionAggregateRow(result.rows?.[0]);
  }

  const whereSql = buildCollectionRecordWhereSql(filters);

  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_records,
      COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
    FROM public.collection_records
    ${whereSql}
  `);

  return mapCollectionAggregateRow(result.rows?.[0]);
}

export async function summarizeCollectionRecordsByNickname(filters?: {
  from?: string;
  to?: string;
  search?: string;
  createdByLogin?: string;
  nicknames?: string[];
}): Promise<Array<{ nickname: string; totalRecords: number; totalAmount: number }>> {
  if (
    canUseCollectionRecordDailyRollups(filters)
    && !(await hasPendingCollectionRecordDailyRollupSlices(filters))
  ) {
    const whereSql = buildCollectionRecordDailyRollupWhereSql(filters);

    const result = await db.execute(sql`
      SELECT
        collection_staff_nickname as nickname,
        COALESCE(SUM(total_records), 0)::int AS total_records,
        COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_record_daily_rollups
      ${whereSql}
      GROUP BY collection_staff_nickname
      ORDER BY lower(collection_staff_nickname) ASC
    `);

    return (result.rows || []).map((row: any) => ({
      nickname: String(row.nickname || "Unknown"),
      totalRecords: Number(row.total_records || 0),
      totalAmount: Number(row.total_amount || 0),
    }));
  }

  const whereSql = buildCollectionRecordWhereSql(filters);

  const result = await db.execute(sql`
    SELECT
      collection_staff_nickname as nickname,
      COUNT(*)::int AS total_records,
      COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
    FROM public.collection_records
    ${whereSql}
    GROUP BY collection_staff_nickname
    ORDER BY lower(collection_staff_nickname) ASC
  `);

  return (result.rows || []).map((row: any) => ({
    nickname: String(row.nickname || "Unknown"),
    totalRecords: Number(row.total_records || 0),
    totalAmount: Number(row.total_amount || 0),
  }));
}

export async function summarizeCollectionRecordsByNicknameAndPaymentDate(filters?: {
  from?: string;
  to?: string;
  search?: string;
  createdByLogin?: string;
  nicknames?: string[];
}): Promise<CollectionNicknameDailyAggregate[]> {
  if (
    canUseCollectionRecordDailyRollups(filters)
    && !(await hasPendingCollectionRecordDailyRollupSlices(filters))
  ) {
    const whereSql = buildCollectionRecordDailyRollupWhereSql(filters);

    const result = await db.execute(sql`
      SELECT
        lower(collection_staff_nickname) AS nickname_key,
        MIN(collection_staff_nickname) AS nickname,
        payment_date,
        COALESCE(SUM(total_records), 0)::int AS total_records,
        COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_record_daily_rollups
      ${whereSql}
      GROUP BY lower(collection_staff_nickname), payment_date
      ORDER BY lower(collection_staff_nickname) ASC, payment_date ASC
    `);

    return mapCollectionNicknameDailyAggregateRows(result.rows || []);
  }

  const whereSql = buildCollectionRecordWhereSql(filters);

  const result = await db.execute(sql`
    SELECT
      lower(collection_staff_nickname) AS nickname_key,
      MIN(collection_staff_nickname) AS nickname,
      payment_date,
      COUNT(*)::int AS total_records,
      COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
    FROM public.collection_records
    ${whereSql}
    GROUP BY lower(collection_staff_nickname), payment_date
    ORDER BY lower(collection_staff_nickname) ASC, payment_date ASC
  `);

  return mapCollectionNicknameDailyAggregateRows(result.rows || []);
}

export async function summarizeCollectionRecordsOlderThan(
  beforeDate: string,
): Promise<{ totalRecords: number; totalAmount: number }> {
  const normalizedBeforeDate = String(beforeDate || "").trim();
  if (!normalizedBeforeDate) {
    return {
      totalRecords: 0,
      totalAmount: 0,
    };
  }

  const hasPending = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM public.collection_record_daily_rollup_refresh_queue
      WHERE payment_date < ${normalizedBeforeDate}::date
    ) AS has_pending
  `);
  if (Boolean((hasPending.rows?.[0] as { has_pending?: boolean } | undefined)?.has_pending)) {
    const fallbackResult = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      WHERE payment_date < ${normalizedBeforeDate}::date
    `);
    return mapCollectionAggregateRow(fallbackResult.rows?.[0]);
  }

  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(total_records), 0)::int AS total_records,
      COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount
    FROM public.collection_record_daily_rollups
    WHERE payment_date < ${normalizedBeforeDate}::date
  `);

  return mapCollectionAggregateRow(result.rows?.[0]);
}

export async function purgeCollectionRecordsOlderThan(beforeDate: string): Promise<{
  totalRecords: number;
  totalAmount: number;
  receiptPaths: string[];
}> {
  const normalizedBeforeDate = String(beforeDate || "").trim();
  if (!normalizedBeforeDate) {
    return {
      totalRecords: 0,
      totalAmount: 0,
      receiptPaths: [],
    };
  }

  return db.transaction(async (tx) => {
    const oldRecordsResult = await tx.execute(sql`
      SELECT
        id,
        amount,
        receipt_file
      FROM public.collection_records
      WHERE payment_date < ${normalizedBeforeDate}::date
      ORDER BY payment_date ASC, created_at ASC, id ASC
    `);

    const oldRecordRows = Array.isArray(oldRecordsResult.rows) ? oldRecordsResult.rows : [];
    if (!oldRecordRows.length) {
      return {
        totalRecords: 0,
        totalAmount: 0,
        receiptPaths: [],
      };
    }

    const recordIds = extractCollectionRecordIds(oldRecordRows);
    if (!recordIds.length) {
      return {
        totalRecords: 0,
        totalAmount: 0,
        receiptPaths: [],
      };
    }

    const recordIdSql = sql.join(recordIds.map((value) => sql`${value}::uuid`), sql`, `);
    const receiptRowsResult = await tx.execute(sql`
      SELECT storage_path
      FROM public.collection_record_receipts
      WHERE collection_record_id IN (${recordIdSql})
    `);

    await tx.execute(sql`
      DELETE FROM public.collection_record_receipts
      WHERE collection_record_id IN (${recordIdSql})
    `);

    await tx.execute(sql`
      DELETE FROM public.collection_records
      WHERE id IN (${recordIdSql})
    `);

    await tx.execute(sql`
      DELETE FROM public.collection_record_daily_rollups
      WHERE payment_date < ${normalizedBeforeDate}::date
    `);
    await rebuildCollectionRecordMonthlyRollups(tx);
    await tx.execute(sql`
      DELETE FROM public.collection_record_daily_rollup_refresh_queue
      WHERE payment_date < ${normalizedBeforeDate}::date
    `);

    const receiptPaths = collectCollectionReceiptPaths(
      oldRecordRows,
      Array.isArray(receiptRowsResult.rows) ? receiptRowsResult.rows : [],
    );

    return {
      totalRecords: oldRecordRows.length,
      totalAmount: sumCollectionRowAmounts(oldRecordRows),
      receiptPaths,
    };
  });
}

export async function getCollectionMonthlySummary(filters: {
  year: number;
  nicknames?: string[];
  createdByLogin?: string;
}): Promise<CollectionMonthlySummary[]> {
  const { whereSql } = buildCollectionMonthlySummaryWhereSql(filters);
  if (await hasPendingCollectionRecordDailyRollupSlices({
    from: `${filters.year}-01-01`,
    to: `${filters.year}-12-31`,
    createdByLogin: filters.createdByLogin,
    nicknames: filters.nicknames,
  })) {
    const fallbackResult = await db.execute(sql`
      SELECT
        EXTRACT(MONTH FROM payment_date)::int AS month,
        COUNT(*)::int AS total_records,
        COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
      FROM public.collection_records
      ${whereSql}
      GROUP BY 1
      ORDER BY 1
      LIMIT 12
    `);

    return mapCollectionMonthlySummaryRows(fallbackResult.rows || []);
  }

  const monthlyWhere = buildCollectionRecordMonthlyRollupWhereSql(filters);
  const result = await db.execute(sql`
    SELECT
      month,
      COALESCE(SUM(total_records), 0)::int AS total_records,
      COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount
    FROM public.collection_record_monthly_rollups
    ${monthlyWhere.whereSql}
    GROUP BY month
    ORDER BY month
    LIMIT 12
  `);

  return mapCollectionMonthlySummaryRows(result.rows || []);
}

export async function getCollectionRecordById(id: string): Promise<CollectionRecord | undefined> {
  const result = await db.execute(sql`
    SELECT
      id,
      customer_name,
      ic_number,
      customer_phone,
      account_number,
      batch,
      payment_date,
      amount,
      receipt_file,
      created_by_login,
      collection_staff_nickname,
      staff_username,
      created_at,
      updated_at
    FROM public.collection_records
    WHERE id = ${id}::uuid
    LIMIT 1
  `);

  const row = result.rows?.[0];
  if (!row) return undefined;
  const [record] = await attachCollectionReceipts(db, [mapCollectionRecordRow(row)]);
  return record;
}

export async function updateCollectionRecord(
  id: string,
  data: UpdateCollectionRecordInput,
  options?: UpdateCollectionRecordOptions,
): Promise<CollectionRecord | undefined> {
  const updateChunks: any[] = [];

  if (data.customerName !== undefined) {
    updateChunks.push(sql`customer_name = ${data.customerName}`);
  }
  if (data.icNumber !== undefined) {
    updateChunks.push(sql`ic_number = ${data.icNumber}`);
  }
  if (data.customerPhone !== undefined) {
    updateChunks.push(sql`customer_phone = ${data.customerPhone}`);
  }
  if (data.accountNumber !== undefined) {
    updateChunks.push(sql`account_number = ${data.accountNumber}`);
  }
  if (data.batch !== undefined) {
    updateChunks.push(sql`batch = ${data.batch}`);
  }
  if (data.paymentDate !== undefined) {
    updateChunks.push(sql`payment_date = ${data.paymentDate}::date`);
  }
  if (data.amount !== undefined) {
    updateChunks.push(sql`amount = ${data.amount}`);
  }
  if (Object.prototype.hasOwnProperty.call(data, "receiptFile")) {
    // collection_records.receipt_file is a compatibility cache only.
    // The mutation layer must only ever set this to null (transitional legacy cleanup).
    // New receipt files must be written through collection_record_receipts, not this field.
    updateChunks.push(sql`receipt_file = ${data.receiptFile ?? null}`);
  }
  if (data.collectionStaffNickname !== undefined) {
    updateChunks.push(sql`collection_staff_nickname = ${data.collectionStaffNickname}`);
    updateChunks.push(sql`staff_username = ${data.collectionStaffNickname}`);
  }

  const expectedUpdatedAt =
    options?.expectedUpdatedAt instanceof Date
    && Number.isFinite(options.expectedUpdatedAt.getTime())
      ? options.expectedUpdatedAt
      : null;

  const removeAllReceipts = options?.removeAllReceipts === true;
  const removeReceiptIds = Array.from(
    new Set(
      Array.isArray(options?.removeReceiptIds)
        ? options.removeReceiptIds.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
    ),
  );
  const newReceipts = Array.isArray(options?.newReceipts)
    ? options.newReceipts
    : [];
  const hasReceiptMutation = removeAllReceipts || removeReceiptIds.length > 0 || newReceipts.length > 0;

  if (!updateChunks.length && !hasReceiptMutation) {
    const current = await getCollectionRecordById(id);
    if (!current) return undefined;
    if (
      expectedUpdatedAt
      && current.updatedAt instanceof Date
      && Number.isFinite(current.updatedAt.getTime())
      && current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    ) {
      return undefined;
    }
    return current;
  }

  updateChunks.push(sql`updated_at = date_trunc('milliseconds', now())`);

  const whereClauses = [sql`id = ${id}::uuid`];
  if (expectedUpdatedAt) {
    whereClauses.push(
      sql`date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', CAST(${expectedUpdatedAt} AS timestamp))`,
    );
  }

  return db.transaction(async (tx) => {
    const existingSliceResult = await tx.execute(sql`
      SELECT payment_date, created_by_login, collection_staff_nickname
      FROM public.collection_records
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const existingSlice = mapCollectionRecordRowToDailyRollupSlice(
      (existingSliceResult.rows?.[0] || null) as Record<string, unknown> | null,
    );

    const result = await tx.execute(sql`
      UPDATE public.collection_records
      SET ${sql.join(updateChunks, sql`, `)}
      WHERE ${sql.join(whereClauses, sql` AND `)}
      RETURNING
        id,
        customer_name,
        ic_number,
        customer_phone,
        account_number,
        batch,
        payment_date,
        amount,
        receipt_file,
        created_by_login,
        collection_staff_nickname,
        staff_username,
        created_at,
        updated_at
    `);

    const row = result.rows?.[0];
    if (!row) return undefined;

    if (removeAllReceipts) {
      await deleteAllCollectionRecordReceiptRows(tx, id);
    } else if (removeReceiptIds.length > 0) {
      await deleteCollectionRecordReceiptRows(tx, id, removeReceiptIds);
    }

    if (newReceipts.length > 0) {
      await createCollectionRecordReceiptRows(tx, id, newReceipts);
    }

    await enqueueCollectionRecordDailyRollupSlices(tx, [
      existingSlice,
      mapCollectionRecordRowToDailyRollupSlice((row || null) as Record<string, unknown> | null),
    ]);

    const [hydrated] = await attachCollectionReceipts(tx, [mapCollectionRecordRow(row)]);
    return hydrated || mapCollectionRecordRow(row);
  });
}

export async function deleteCollectionRecord(
  id: string,
  options?: DeleteCollectionRecordOptions,
): Promise<boolean> {
  const expectedUpdatedAt =
    options?.expectedUpdatedAt instanceof Date
    && Number.isFinite(options.expectedUpdatedAt.getTime())
      ? options.expectedUpdatedAt
      : null;

  const whereClauses = [sql`id = ${id}::uuid`];
  if (expectedUpdatedAt) {
    whereClauses.push(
      sql`date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', CAST(${expectedUpdatedAt} AS timestamp))`,
    );
  }

  return db.transaction(async (tx) => {
    const existingSliceResult = await tx.execute(sql`
      SELECT payment_date, created_by_login, collection_staff_nickname
      FROM public.collection_records
      WHERE id = ${id}::uuid
      LIMIT 1
    `);
    const existingSlice = mapCollectionRecordRowToDailyRollupSlice(
      (existingSliceResult.rows?.[0] || null) as Record<string, unknown> | null,
    );

    const deletedRecord = await tx.execute(sql`
      DELETE FROM public.collection_records
      WHERE ${sql.join(whereClauses, sql` AND `)}
      RETURNING id
    `);
    const deletedId = deletedRecord.rows?.[0]?.id as string | undefined;
    if (!deletedId) {
      return false;
    }

    await tx.execute(sql`
      DELETE FROM public.collection_record_receipts
      WHERE collection_record_id = ${deletedId}::uuid
    `);

    await enqueueCollectionRecordDailyRollupSlices(tx, [existingSlice]);
    return true;
  });
}
