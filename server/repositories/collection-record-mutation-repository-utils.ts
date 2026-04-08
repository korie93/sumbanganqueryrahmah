import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type {
  CollectionRecord,
  DeleteCollectionRecordOptions,
  UpdateCollectionRecordInput,
  UpdateCollectionRecordOptions,
} from "../storage-postgres";
import {
  encryptCollectionPiiFieldValue,
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
  resolveStoredCollectionPiiPlaintextValue,
} from "../lib/collection-pii-encryption";
import {
  getCollectionRecordById,
} from "./collection-record-read-utils";
import {
  enqueueCollectionRecordDailyRollupSlices,
  mapCollectionRecordRowToDailyRollupSlice,
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
import { buildTextArraySql } from "./sql-array-utils";

function resolveExpectedCollectionRecordUpdatedAt(
  value: Date | undefined,
): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value
    : null;
}

export async function updateCollectionRecord(
  id: string,
  data: UpdateCollectionRecordInput,
  options?: UpdateCollectionRecordOptions,
): Promise<CollectionRecord | undefined> {
  const updateChunks: any[] = [];

  if (data.customerName !== undefined) {
    const customerNameEncrypted = encryptCollectionPiiFieldValue(data.customerName);
    updateChunks.push(sql`customer_name = ${resolveStoredCollectionPiiPlaintextValue({
      plaintext: data.customerName,
      encrypted: customerNameEncrypted,
    })}`);
    if (customerNameEncrypted !== null) {
      updateChunks.push(sql`customer_name_encrypted = ${customerNameEncrypted}`);
    }
    updateChunks.push(sql`customer_name_search_hash = ${hashCollectionPiiSearchValue("customerName", data.customerName)}`);
    const customerNameSearchHashes = hashCollectionCustomerNameSearchTerms(data.customerName);
    updateChunks.push(sql`customer_name_search_hashes = ${customerNameSearchHashes?.length
      ? buildTextArraySql(customerNameSearchHashes)
      : null}`);
  }
  if (data.icNumber !== undefined) {
    const icNumberEncrypted = encryptCollectionPiiFieldValue(data.icNumber);
    updateChunks.push(sql`ic_number = ${resolveStoredCollectionPiiPlaintextValue({
      plaintext: data.icNumber,
      encrypted: icNumberEncrypted,
    })}`);
    if (icNumberEncrypted !== null) {
      updateChunks.push(sql`ic_number_encrypted = ${icNumberEncrypted}`);
    }
    updateChunks.push(sql`ic_number_search_hash = ${hashCollectionPiiSearchValue("icNumber", data.icNumber)}`);
  }
  if (data.customerPhone !== undefined) {
    const customerPhoneEncrypted = encryptCollectionPiiFieldValue(data.customerPhone);
    updateChunks.push(sql`customer_phone = ${resolveStoredCollectionPiiPlaintextValue({
      plaintext: data.customerPhone,
      encrypted: customerPhoneEncrypted,
    })}`);
    if (customerPhoneEncrypted !== null) {
      updateChunks.push(sql`customer_phone_encrypted = ${customerPhoneEncrypted}`);
    }
    updateChunks.push(sql`customer_phone_search_hash = ${hashCollectionPiiSearchValue("customerPhone", data.customerPhone)}`);
  }
  if (data.accountNumber !== undefined) {
    const accountNumberEncrypted = encryptCollectionPiiFieldValue(data.accountNumber);
    updateChunks.push(sql`account_number = ${resolveStoredCollectionPiiPlaintextValue({
      plaintext: data.accountNumber,
      encrypted: accountNumberEncrypted,
    })}`);
    if (accountNumberEncrypted !== null) {
      updateChunks.push(sql`account_number_encrypted = ${accountNumberEncrypted}`);
    }
    updateChunks.push(sql`account_number_search_hash = ${hashCollectionPiiSearchValue("accountNumber", data.accountNumber)}`);
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

  const expectedUpdatedAt = resolveExpectedCollectionRecordUpdatedAt(options?.expectedUpdatedAt);
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
        customer_name_encrypted,
        customer_name_search_hashes,
        ic_number,
        ic_number_encrypted,
        customer_phone,
        customer_phone_encrypted,
        account_number,
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
  const expectedUpdatedAt = resolveExpectedCollectionRecordUpdatedAt(options?.expectedUpdatedAt);
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
