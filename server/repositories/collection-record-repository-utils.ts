import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type {
  CollectionMonthlySummary,
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
  buildCollectionRecordWhereSql,
  collectCollectionReceiptPaths,
  extractCollectionRecordIds,
  mapCollectionAggregateRow,
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

export async function createCollectionRecord(data: CreateCollectionRecordInput): Promise<CollectionRecord> {
  const id = randomUUID();
  await db.execute(sql`
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
  const created = await getCollectionRecordById(id);
  if (!created) {
    throw new Error("Failed to load created collection record.");
  }
  return created;
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
      COUNT(*)::int AS total_records,
      COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
    FROM public.collection_records
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
      COUNT(*)::int AS total_records,
      COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
    FROM public.collection_records
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
    return true;
  });
}
