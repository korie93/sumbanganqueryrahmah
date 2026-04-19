import { sql } from "drizzle-orm";
import {
  buildCollectionRecordPiiSearchHashes,
  buildEncryptedCollectionRecordPiiValues,
  resolveCollectionCustomerNameSearchHashesValue,
  resolveStoredCollectionPiiPlaintextValue,
} from "../lib/collection-pii-encryption";
import {
  BACKUP_CHUNK_SIZE,
  BACKUP_RESTORE_MAX_TRACKED_COLLECTION_RECORD_IDS_DEFAULT,
  type BackupCollectionReceipt,
  type BackupCollectionRecord,
  type RestoreStats,
} from "./backups-repository-types";
import {
  normalizeBackupCollectionReceipt,
  normalizeBackupCollectionRecord,
} from "./backups-restore-collection-normalize-utils";
import { logger } from "../lib/logger";
import { rebuildCollectionRecordDailyRollups } from "./collection-record-repository-utils";
import {
  type BackupPayloadChunkReader,
  type BackupRestoreExecutor,
} from "./backups-restore-shared-utils";
import { buildTextArraySql } from "./sql-array-utils";

const RESTORED_COLLECTION_RECORD_IDS_TEMP_TABLE = sql.raw("sqr_restored_collection_record_ids");
const RESTORE_INSERT_BATCH_SIZE = 200;
const RESTORE_SYSTEM_ACTOR_USERNAME = "system";
const RESTORE_TRACKED_RECORD_IDS_WARNING_RATIO = 0.8;

type NormalizedBackupCollectionRecord = NonNullable<ReturnType<typeof normalizeBackupCollectionRecord>>;
type NormalizedBackupCollectionReceipt = NonNullable<ReturnType<typeof normalizeBackupCollectionReceipt>>;

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
  options?: {
    maxTrackedRecordIds?: number;
  },
) {
  const maxTrackedRecordIds = Math.max(
    1_000,
    Math.trunc(options?.maxTrackedRecordIds ?? BACKUP_RESTORE_MAX_TRACKED_COLLECTION_RECORD_IDS_DEFAULT),
  );
  let trackedRecordIds = 0;
  let trackedRecordIdsWarningLogged = false;

  const flushRecordInsertBatch = async (insertBatch: NormalizedBackupCollectionRecord[]) => {
    if (!insertBatch.length) {
      return;
    }

    const restoredIdValuesSql = sql.join(
      insertBatch.map((row) => sql`(${row.id}::uuid)`),
      sql`, `,
    );
    const trackedIdsResult = await tx.execute(sql`
      INSERT INTO ${RESTORED_COLLECTION_RECORD_IDS_TEMP_TABLE} (id)
      VALUES ${restoredIdValuesSql}
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `);
    const newlyTrackedRecordIds = trackedIdsResult.rows?.length || 0;
    const nextTrackedRecordIds = trackedRecordIds + newlyTrackedRecordIds;
    if (nextTrackedRecordIds > maxTrackedRecordIds) {
      throw new Error(
        `Backup restore requires tracking ${nextTrackedRecordIds.toLocaleString()} unique collection record ids, exceeding the configured safety limit of ${maxTrackedRecordIds.toLocaleString()}.`,
      );
    }
    trackedRecordIds = nextTrackedRecordIds;
    if (
      !trackedRecordIdsWarningLogged
      && trackedRecordIds >= Math.floor(maxTrackedRecordIds * RESTORE_TRACKED_RECORD_IDS_WARNING_RATIO)
    ) {
      trackedRecordIdsWarningLogged = true;
      logger.warn("Backup restore tracking is approaching the configured safety limit", {
        trackedRecordIds,
        maxTrackedRecordIds,
        trackedRecordIdsWarningThreshold: Math.floor(
          maxTrackedRecordIds * RESTORE_TRACKED_RECORD_IDS_WARNING_RATIO,
        ),
      });
    }

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
    BACKUP_CHUNK_SIZE,
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
    BACKUP_CHUNK_SIZE,
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
