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

type CollectionRecordDailyRollupSlice = {
  paymentDate?: string | null;
  createdByLogin?: string | null;
  collectionStaffNickname?: string | null;
};

function normalizeCollectionRecordDailyRollupSlice(
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

function mapCollectionRecordRowToDailyRollupSlice(
  row: Record<string, unknown> | null | undefined,
): Required<CollectionRecordDailyRollupSlice> | null {
  return normalizeCollectionRecordDailyRollupSlice({
    paymentDate: String(row?.payment_date || row?.paymentDate || ""),
    createdByLogin: String(row?.created_by_login || row?.createdByLogin || ""),
    collectionStaffNickname: String(row?.collection_staff_nickname || row?.collectionStaffNickname || ""),
  });
}

async function refreshCollectionRecordDailyRollupSlice(
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
}

async function refreshCollectionRecordDailyRollupSlices(
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

    await refreshCollectionRecordDailyRollupSlices(tx, [{
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
  if (canUseCollectionRecordDailyRollups(filters)) {
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
  if (canUseCollectionRecordDailyRollups(filters)) {
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
  if (canUseCollectionRecordDailyRollups(filters)) {
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
  const result = await db.execute(sql`
    SELECT
      EXTRACT(MONTH FROM payment_date)::int AS month,
      COALESCE(SUM(total_records), 0)::int AS total_records,
      COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount
    FROM public.collection_record_daily_rollups
    ${whereSql}
    GROUP BY 1
    ORDER BY 1
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

    await refreshCollectionRecordDailyRollupSlices(tx, [
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

    await refreshCollectionRecordDailyRollupSlices(tx, [existingSlice]);
    return true;
  });
}
