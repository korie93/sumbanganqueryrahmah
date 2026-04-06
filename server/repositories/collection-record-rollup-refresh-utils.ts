import { sql } from "drizzle-orm";
import { COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL } from "../lib/collection-rollup-refresh-notification";
import { mapCollectionAggregateRow } from "./collection-record-query-utils";
import {
  dedupeCollectionRecordDailyRollupSlices,
  normalizeCollectionRecordDailyRollupSlice,
} from "./collection-record-rollup-slice-utils";
import type {
  CollectionRecordDailyRollupSlice,
  CollectionRepositoryExecutor,
} from "./collection-record-rollup-types";

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
  const normalizedSlices = dedupeCollectionRecordDailyRollupSlices(slices);
  for (const slice of normalizedSlices) {
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
  const normalizedSlices = dedupeCollectionRecordDailyRollupSlices(slices);

  for (const slice of normalizedSlices) {
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

  if (normalizedSlices.length > 0) {
    await executor.execute(sql`
      SELECT pg_notify(${COLLECTION_ROLLUP_REFRESH_NOTIFICATION_CHANNEL}, 'queued')
    `);
  }
}
