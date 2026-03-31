import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type {
  CollectionMonthlySummary,
  CollectionNicknameDailyAggregate,
  CollectionRecord,
  CollectionRecordAggregateFilters,
  CollectionRecordListFilters,
  CollectionRecordReceipt,
  CreateCollectionRecordInput,
  CreateCollectionRecordReceiptInput,
  DeleteCollectionRecordOptions,
  UpdateCollectionRecordInput,
  UpdateCollectionRecordOptions,
} from "../storage-postgres";
import {
  collectCollectionReceiptPaths,
  extractCollectionRecordIds,
  sumCollectionRowAmounts,
} from "./collection-record-query-utils";
import {
  getCollectionMonthlySummary,
  getCollectionRecordById,
  listCollectionRecords,
  summarizeCollectionRecords,
  summarizeCollectionRecordsByNickname,
  summarizeCollectionRecordsByNicknameAndPaymentDate,
  summarizeCollectionRecordsOlderThan,
} from "./collection-record-read-utils";
import {
  enqueueCollectionRecordDailyRollupSlices,
  mapCollectionRecordRowToDailyRollupSlice,
  rebuildCollectionRecordMonthlyRollups,
} from "./collection-record-rollup-utils";
import {
  attachCollectionReceipts,
  createCollectionRecordReceiptRows,
  deleteAllCollectionRecordReceiptRows,
  deleteCollectionRecordReceiptRows,
  syncCollectionRecordReceiptValidation,
  updateCollectionRecordReceiptRows,
} from "./collection-receipt-utils";
import { mapCollectionRecordRow } from "./collection-repository-mappers";
export {
  claimNextCollectionRecordDailyRollupRefreshSlice,
  clearCollectionRecordDailyRollupRefreshQueue,
  completeCollectionRecordDailyRollupRefreshSlice,
  enqueueCollectionRecordDailyRollupSlices,
  failCollectionRecordDailyRollupRefreshSlice,
  getCollectionRecordDailyRollupFreshnessSnapshot,
  getCollectionRecordDailyRollupRefreshQueueSnapshot,
  mapCollectionRecordRowToDailyRollupSlice,
  markRunningCollectionRecordDailyRollupRefreshSlicesQueued,
  normalizeCollectionRecordDailyRollupSlice,
  refreshCollectionRecordDailyRollupSlice,
  refreshCollectionRecordDailyRollupSlices,
  rebuildCollectionRecordDailyRollups,
  rebuildCollectionRecordMonthlyRollups,
  refreshCollectionRecordMonthlyRollupSlice,
  requeueCollectionRecordDailyRollupRefreshFailures,
} from "./collection-record-rollup-utils";

export type {
  CollectionRecordDailyRollupRefreshQueueSnapshot,
  CollectionRecordDailyRollupSlice,
  CollectionRollupFreshnessSnapshot,
  CollectionRollupFreshnessStatus,
} from "./collection-record-rollup-utils";
export {
  getCollectionMonthlySummary,
  getCollectionRecordById,
  listCollectionRecords,
  summarizeCollectionRecords,
  summarizeCollectionRecordsByNickname,
  summarizeCollectionRecordsByNicknameAndPaymentDate,
  summarizeCollectionRecordsOlderThan,
} from "./collection-record-read-utils";

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
    if (!row) {
      throw new Error("Failed to load created collection record.");
    }

    const [created] = await attachCollectionReceipts(tx, [mapCollectionRecordRow(row)]);
    return created || mapCollectionRecordRow(row);
  });
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
    if (Array.isArray(options?.receiptUpdates) && options.receiptUpdates.length > 0) {
      await updateCollectionRecordReceiptRows(tx, id, options.receiptUpdates);
    }

    const syncedRecord = await syncCollectionRecordReceiptValidation(tx, id);

    await enqueueCollectionRecordDailyRollupSlices(tx, [
      existingSlice,
      mapCollectionRecordRowToDailyRollupSlice((row || null) as Record<string, unknown> | null),
    ]);

    if (syncedRecord) {
      return syncedRecord;
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
