import { sql } from "drizzle-orm";
import {
  buildCollectionRecordPiiSearchHashes,
  buildEncryptedCollectionRecordPiiValues,
  resolveCollectionCustomerNameSearchHashesValue,
  resolveStoredCollectionPiiPlaintextValue,
} from "../lib/collection-pii-encryption";
import {
  type BackupCollectionReceipt,
  type BackupCollectionRecord,
  type BackupCollectionRecordPurgeHistory,
  type RestoreStats,
} from "./backups-repository-types";
import { resolveRestoreChunkSize } from "./backups-restore-config";
import {
  normalizeBackupCollectionReceipt,
  normalizeBackupCollectionRecord,
  normalizeBackupCollectionRecordPurgeHistory,
} from "./backups-restore-collection-normalize-utils";
import { rebuildCollectionRecordDailyRollups } from "./collection-record-repository-utils";
import {
  type BackupPayloadChunkReader,
  type BackupRestoreExecutor,
} from "./backups-restore-shared-utils";
import { buildTextArraySql } from "./sql-array-utils";

const RESTORED_COLLECTION_RECORD_IDS_TEMP_TABLE = sql.raw("sqr_restored_collection_record_ids");
const RESTORE_INSERT_BATCH_SIZE = 200;
const RESTORE_SYSTEM_ACTOR_USERNAME = "system";

type NormalizedBackupCollectionRecord = NonNullable<ReturnType<typeof normalizeBackupCollectionRecord>>;
type NormalizedBackupCollectionReceipt = NonNullable<ReturnType<typeof normalizeBackupCollectionReceipt>>;
type NormalizedBackupCollectionRecordPurgeHistory = NonNullable<
  ReturnType<typeof normalizeBackupCollectionRecordPurgeHistory>
>;

export async function initializeRestoreTrackingTempTable(tx: BackupRestoreExecutor) {
  await tx.execute(sql`
    CREATE TEMP TABLE ${RESTORED_COLLECTION_RECORD_IDS_TEMP_TABLE} (
      id uuid PRIMARY KEY
    )
    ON COMMIT DROP
  `);
}

export async function restoreCollectionRecordsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  const flushRecordInsertBatch = async (insertBatch: NormalizedBackupCollectionRecord[]) => {
    if (!insertBatch.length) {
      return;
    }

    const restoredIdValuesSql = sql.join(
      insertBatch.map((row) => sql`(${row.id}::uuid)`),
      sql`, `,
    );
    await tx.execute(sql`
      INSERT INTO ${RESTORED_COLLECTION_RECORD_IDS_TEMP_TABLE} (id)
      VALUES ${restoredIdValuesSql}
      ON CONFLICT (id) DO NOTHING
    `);

    const valuesSql = sql.join(
      insertBatch.map((row) => {
        const encryptedPii = buildEncryptedCollectionRecordPiiValues({
          customerName: row.customerName,
          icNumber: row.icNumber,
          customerPhone: row.customerPhone,
          accountNumber: row.accountNumber,
        });
        const piiSearchHashes = buildCollectionRecordPiiSearchHashes({
          customerName: row.customerName,
          icNumber: row.icNumber,
          customerPhone: row.customerPhone,
          accountNumber: row.accountNumber,
        });
        const persistedCustomerName = resolveStoredCollectionPiiPlaintextValue({
          field: "customerName",
          plaintext: row.customerName,
          encrypted: encryptedPii?.customerNameEncrypted,
        });
        const persistedIcNumber = resolveStoredCollectionPiiPlaintextValue({
          field: "icNumber",
          plaintext: row.icNumber,
          encrypted: encryptedPii?.icNumberEncrypted,
        });
        const persistedCustomerPhone = resolveStoredCollectionPiiPlaintextValue({
          field: "customerPhone",
          plaintext: row.customerPhone,
          encrypted: encryptedPii?.customerPhoneEncrypted,
        });
        const persistedAccountNumber = resolveStoredCollectionPiiPlaintextValue({
          field: "accountNumber",
          plaintext: row.accountNumber,
          encrypted: encryptedPii?.accountNumberEncrypted,
        });
        const customerNameSearchHashes = resolveCollectionCustomerNameSearchHashesValue({
          plaintext: row.customerName,
          encrypted: encryptedPii?.customerNameEncrypted,
          hashes: row.customerNameSearchHashes,
        });
        const createdByLoginSql = sql`COALESCE(
          (
            SELECT usr.username
            FROM public.users usr
            WHERE lower(usr.username) = lower(${row.createdByLogin})
            LIMIT 1
          ),
          ${RESTORE_SYSTEM_ACTOR_USERNAME}
        )`;
        const sourceImportIdSql = row.sourceImportId
          ? sql`(
              SELECT imp.id
              FROM public.imports imp
              WHERE imp.id = ${row.sourceImportId}
              LIMIT 1
            )`
          : sql`NULL`;
        const sourceDataRowIdSql = row.sourceDataRowId && row.sourceImportId
          ? sql`(
              SELECT source_row.id
              FROM public.data_rows source_row
              WHERE source_row.id = ${row.sourceDataRowId}
                AND source_row.import_id = ${row.sourceImportId}
              LIMIT 1
            )`
          : sql`NULL`;
        return sql`(
          ${row.id}::uuid,
          ${persistedCustomerName},
          ${encryptedPii?.customerNameEncrypted ?? null},
          ${piiSearchHashes?.customerNameSearchHash ?? null},
          ${(customerNameSearchHashes ?? piiSearchHashes?.customerNameSearchHashes)?.length
            ? buildTextArraySql(customerNameSearchHashes ?? piiSearchHashes?.customerNameSearchHashes ?? [])
            : null},
          ${persistedIcNumber},
          ${encryptedPii?.icNumberEncrypted ?? null},
          ${piiSearchHashes?.icNumberSearchHash ?? null},
          ${persistedCustomerPhone},
          ${encryptedPii?.customerPhoneEncrypted ?? null},
          ${piiSearchHashes?.customerPhoneSearchHash ?? null},
          ${persistedAccountNumber},
          ${encryptedPii?.accountNumberEncrypted ?? null},
          ${piiSearchHashes?.accountNumberSearchHash ?? null},
          ${sourceImportIdSql},
          ${sourceDataRowIdSql},
          ${row.sourceImportName},
          ${row.sourceFilename},
          ${row.agingBucket},
          ${row.totalDue},
          ${row.billingPrincipalOsp},
          ${row.callingDate}::date,
          ${row.callingWindowEndExclusive}::date,
          ${row.sourceMatchBasis},
          ${row.sourceMatchAccuracy},
          ${row.batch},
          ${row.paymentDate}::date,
          ${row.amount},
          ${row.receiptFile},
          ${row.receiptTotalAmount},
          ${row.receiptValidationStatus},
          ${row.receiptValidationMessage},
          ${row.receiptCount},
          ${row.duplicateReceiptFlag},
          ${createdByLoginSql},
          ${row.collectionStaffNickname},
          ${row.staffUsername},
          ${row.createdAt}
        )`;
      }),
      sql`, `,
    );

    const insertedResult = await tx.execute(sql`
      INSERT INTO public.collection_records (
        id,
        customer_name,
        customer_name_encrypted,
        customer_name_search_hash,
        customer_name_search_hashes,
        ic_number,
        ic_number_encrypted,
        ic_number_search_hash,
        customer_phone,
        customer_phone_encrypted,
        customer_phone_search_hash,
        account_number,
        account_number_encrypted,
        account_number_search_hash,
        source_import_id,
        source_data_row_id,
        source_import_name,
        source_filename,
        aging_bucket,
        total_due,
        billing_principal_osp,
        calling_date,
        calling_window_end_exclusive,
        source_match_basis,
        source_match_accuracy,
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
        created_at
      )
      VALUES ${valuesSql}
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `);
    const insertedCount = insertedResult.rows?.length || 0;
    stats.collectionRecords.inserted += insertedCount;
    stats.collectionRecords.skipped += insertBatch.length - insertedCount;
  };

  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionRecord>(
    "collectionRecords",
    restoreChunkSize,
  )) {
    const pendingBatch: NormalizedBackupCollectionRecord[] = [];

    for (const record of chunk) {
      const normalized = normalizeBackupCollectionRecord(record);
      if (!normalized) {
        continue;
      }

      stats.collectionRecords.processed += 1;
      pendingBatch.push(normalized);

      if (pendingBatch.length >= RESTORE_INSERT_BATCH_SIZE) {
        await flushRecordInsertBatch(pendingBatch);
        pendingBatch.length = 0;
      }
    }

    await flushRecordInsertBatch(pendingBatch);
  }
}

export async function restoreCollectionRecordReceiptsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  const flushReceiptInsertBatch = async (insertBatch: NormalizedBackupCollectionReceipt[]) => {
    if (!insertBatch.length) {
      return;
    }

    const valuesSql = sql.join(
      insertBatch.map((row) => sql`(
        ${row.id}::uuid,
        ${row.collectionRecordId}::uuid,
        ${row.storagePath},
        ${row.originalFileName},
        ${row.originalMimeType},
        ${row.originalExtension},
        ${row.fileSize},
        ${row.receiptAmount},
        ${row.extractedAmount},
        ${row.extractionStatus},
        ${row.extractionConfidence},
        ${row.receiptDate},
        ${row.receiptReference},
        ${row.fileHash},
        ${row.createdAt}
      )`),
      sql`, `,
    );
    const insertedResult = await tx.execute(sql`
      INSERT INTO public.collection_record_receipts (
        id,
        collection_record_id,
        storage_path,
        original_file_name,
        original_mime_type,
        original_extension,
        file_size,
        receipt_amount,
        extracted_amount,
        extraction_status,
        extraction_confidence,
        receipt_date,
        receipt_reference,
        file_hash,
        created_at
      )
      VALUES ${valuesSql}
      ON CONFLICT (collection_record_id, storage_path) DO NOTHING
      RETURNING id
    `);
    const insertedCount = insertedResult.rows?.length || 0;
    stats.collectionRecordReceipts.inserted += insertedCount;
    stats.collectionRecordReceipts.skipped += insertBatch.length - insertedCount;
  };

  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionReceipt>(
    "collectionRecordReceipts",
    restoreChunkSize,
  )) {
    const pendingBatch: NormalizedBackupCollectionReceipt[] = [];

    for (const receipt of chunk) {
      const normalized = normalizeBackupCollectionReceipt(receipt);
      if (!normalized) {
        continue;
      }

      stats.collectionRecordReceipts.processed += 1;
      pendingBatch.push(normalized);

      if (pendingBatch.length >= RESTORE_INSERT_BATCH_SIZE) {
        await flushReceiptInsertBatch(pendingBatch);
        pendingBatch.length = 0;
      }
    }

    await flushReceiptInsertBatch(pendingBatch);
  }
}

export async function restoreCollectionRecordPurgeHistoryFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  const flushHistoryInsertBatch = async (
    insertBatch: NormalizedBackupCollectionRecordPurgeHistory[],
  ) => {
    if (!insertBatch.length) {
      return;
    }

    const valuesSql = sql.join(
      insertBatch.map((row) => sql`(
        ${row.id}::uuid,
        ${row.sourceImportId},
        ${row.sourceDataRowId},
        ${row.sourceImportName},
        ${row.sourceFilename},
        ${row.icNumberSearchHash},
        ${row.customerPhoneSearchHash},
        ${row.accountNumberSearchHash},
        ${row.paymentDate}::date,
        ${row.amount},
        ${row.createdByLogin},
        ${row.collectionStaffNickname},
        ${row.originalCreatedAt},
        ${row.purgedAt},
        ${row.purgedBy},
        ${row.purgeReason}
      )`),
      sql`, `,
    );
    const insertedResult = await tx.execute(sql`
      INSERT INTO public.collection_record_purge_history (
        original_record_id,
        source_import_id,
        source_data_row_id,
        source_import_name,
        source_filename,
        ic_number_search_hash,
        customer_phone_search_hash,
        account_number_search_hash,
        payment_date,
        amount,
        created_by_login,
        collection_staff_nickname,
        original_created_at,
        purged_at,
        purged_by,
        purge_reason
      )
      VALUES ${valuesSql}
      ON CONFLICT (original_record_id) DO NOTHING
      RETURNING original_record_id
    `);
    const insertedCount = insertedResult.rows?.length || 0;
    stats.collectionRecordPurgeHistory.inserted += insertedCount;
    stats.collectionRecordPurgeHistory.skipped += insertBatch.length - insertedCount;
  };

  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionRecordPurgeHistory>(
    "collectionRecordPurgeHistory",
    restoreChunkSize,
  )) {
    const pendingBatch: NormalizedBackupCollectionRecordPurgeHistory[] = [];

    for (const record of chunk) {
      const normalized = normalizeBackupCollectionRecordPurgeHistory(record);
      if (!normalized) {
        stats.collectionRecordPurgeHistory.skipped += 1;
        continue;
      }

      stats.collectionRecordPurgeHistory.processed += 1;
      pendingBatch.push(normalized);

      if (pendingBatch.length >= RESTORE_INSERT_BATCH_SIZE) {
        await flushHistoryInsertBatch(pendingBatch);
        pendingBatch.length = 0;
      }
    }

    await flushHistoryInsertBatch(pendingBatch);
  }
}

export async function syncRestoredCollectionReceiptCache(
  tx: BackupRestoreExecutor,
) {
  await tx.execute(sql`
    UPDATE public.collection_records record
    SET receipt_file = first_receipt.storage_path
    FROM (
      SELECT DISTINCT ON (collection_record_id)
        collection_record_id,
        storage_path
      FROM public.collection_record_receipts
      WHERE collection_record_id IN (
        SELECT id FROM ${RESTORED_COLLECTION_RECORD_IDS_TEMP_TABLE}
      )
      ORDER BY collection_record_id, created_at ASC, id ASC
    ) first_receipt
    WHERE record.id = first_receipt.collection_record_id
  `);
}

export async function finalizeRestoredCollectionRollups(tx: BackupRestoreExecutor) {
  await rebuildCollectionRecordDailyRollups(tx);
  await tx.execute(sql`DELETE FROM public.collection_record_daily_rollup_refresh_queue`);
}
