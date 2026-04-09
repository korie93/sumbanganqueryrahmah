import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type { CollectionAmountMyrNumber } from "../../shared/collection-amount-types";
import type {
  CollectionMonthlySummary,
  CollectionNicknameDailyAggregate,
  CollectionRecord,
  CollectionRecordAggregateFilters,
  CollectionRecordListFilters,
} from "../storage-postgres";
import { parseCollectionAmountMyrNumber } from "../../shared/collection-amount-types";
import {
  buildCollectionMonthlySummaryWhereSql,
  buildCollectionRecordMonthlyRollupWhereSql,
  buildCollectionRecordDailyRollupWhereSql,
  buildCollectionRecordWhereSql,
  canUseCollectionRecordDailyRollups,
  mapCollectionAggregateRow,
  mapCollectionNicknameDailyAggregateRows,
  mapCollectionMonthlySummaryRows,
} from "./collection-record-query-utils";
import { hasPendingCollectionRecordDailyRollupSlices } from "./collection-record-rollup-utils";
import { attachCollectionReceipts } from "./collection-receipt-utils";
import { buildProtectedCollectionPiiSelect } from "./collection-pii-select-utils";
import { mapCollectionRecordRow } from "./collection-repository-mappers";

export async function listCollectionRecords(
  filters?: CollectionRecordListFilters,
): Promise<CollectionRecord[]> {
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
      ${buildProtectedCollectionPiiSelect("customer_name", "customer_name_encrypted")},
      customer_name_encrypted,
      ${buildProtectedCollectionPiiSelect("ic_number", "ic_number_encrypted")},
      ic_number_encrypted,
      ${buildProtectedCollectionPiiSelect("customer_phone", "customer_phone_encrypted")},
      customer_phone_encrypted,
      ${buildProtectedCollectionPiiSelect("account_number", "account_number_encrypted")},
      account_number_encrypted,
      batch,
      payment_date,
      amount,
      receipt_file,
      receipt_total_amount,
      receipt_validation_status,
      receipt_validation_message,
      receipt_count,
      duplicate_receipt_flag,
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

export async function summarizeCollectionRecords(
  filters?: CollectionRecordAggregateFilters,
): Promise<{ totalRecords: number; totalAmount: CollectionAmountMyrNumber }> {
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

export async function summarizeCollectionRecordsByNickname(
  filters?: CollectionRecordAggregateFilters,
): Promise<Array<{ nickname: string; totalRecords: number; totalAmount: CollectionAmountMyrNumber }>> {
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
      totalAmount: parseCollectionAmountMyrNumber(row.total_amount || 0),
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
    totalAmount: parseCollectionAmountMyrNumber(row.total_amount || 0),
  }));
}

export async function summarizeCollectionRecordsByNicknameAndPaymentDate(
  filters?: CollectionRecordAggregateFilters,
): Promise<CollectionNicknameDailyAggregate[]> {
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
): Promise<{ totalRecords: number; totalAmount: CollectionAmountMyrNumber }> {
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
      ${buildProtectedCollectionPiiSelect("customer_name", "customer_name_encrypted")},
      customer_name_encrypted,
      ${buildProtectedCollectionPiiSelect("ic_number", "ic_number_encrypted")},
      ic_number_encrypted,
      ${buildProtectedCollectionPiiSelect("customer_phone", "customer_phone_encrypted")},
      customer_phone_encrypted,
      ${buildProtectedCollectionPiiSelect("account_number", "account_number_encrypted")},
      account_number_encrypted,
      batch,
      payment_date,
      amount,
      receipt_file,
      receipt_total_amount,
      receipt_validation_status,
      receipt_validation_message,
      receipt_count,
      duplicate_receipt_flag,
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
