import crypto from "crypto";
import { sql } from "drizzle-orm";
import { parseCollectionAmountToCents } from "../services/collection/collection-receipt-validation";
import {
  BACKUP_CHUNK_SIZE,
  type BackupCollectionReceipt,
  type BackupCollectionRecord,
  type RestoreStats,
} from "./backups-repository-types";
import { rebuildCollectionRecordDailyRollups } from "./collection-record-repository-utils";
import {
  type BackupPayloadReader,
  type BackupRestoreExecutor,
  toDate,
} from "./backups-restore-shared-utils";

const RESTORED_COLLECTION_RECORD_IDS_TEMP_TABLE = sql.raw("sqr_restored_collection_record_ids");

export type RestorableCollectionRecordRow = {
  id: string;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: string;
  paymentDate: string;
  amount: number;
  receiptFile: string | null;
  receiptTotalAmount: number;
  receiptValidationStatus: string;
  receiptValidationMessage: string | null;
  receiptCount: number;
  duplicateReceiptFlag: boolean;
  createdByLogin: string;
  collectionStaffNickname: string;
  staffUsername: string;
  createdAt: Date;
};

export type RestorableCollectionReceiptRow = {
  id: string;
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  receiptAmount: number | null;
  extractedAmount: number | null;
  extractionStatus: string;
  extractionConfidence: number | null;
  receiptDate: string | null;
  receiptReference: string | null;
  fileHash: string | null;
  createdAt: Date;
};

export function normalizeBackupCollectionRecord(
  record: BackupCollectionRecord,
): RestorableCollectionRecordRow | null {
  const paymentDate =
    typeof record.paymentDate === "string"
      ? record.paymentDate.slice(0, 10)
      : toDate(record.paymentDate)?.toISOString().slice(0, 10) || "";
  if (!paymentDate) {
    return null;
  }
  return {
    id: String(record.id || crypto.randomUUID()),
    customerName: String(record.customerName || "-"),
    icNumber: String(record.icNumber || "-"),
    customerPhone: String(record.customerPhone || "-"),
    accountNumber: String(record.accountNumber || "-"),
    batch: String(record.batch || "P10"),
    paymentDate,
    amount: Number(record.amount || 0),
    receiptFile: record.receiptFile || null,
    receiptTotalAmount: parseCollectionAmountToCents(record.receiptTotalAmount, { allowZero: true }) ?? 0,
    receiptValidationStatus: String(record.receiptValidationStatus || "needs_review"),
    receiptValidationMessage: String(record.receiptValidationMessage || "").trim() || null,
    receiptCount: Math.max(0, Number(record.receiptCount || 0) || 0),
    duplicateReceiptFlag: record.duplicateReceiptFlag === true,
    createdByLogin: String(record.createdByLogin || "system"),
    collectionStaffNickname: String(record.collectionStaffNickname || record.staffUsername || "unknown"),
    staffUsername: String(record.staffUsername || record.collectionStaffNickname || "unknown"),
    createdAt: toDate(record.createdAt) ?? new Date(),
  };
}

export function normalizeBackupCollectionReceipt(
  receipt: BackupCollectionReceipt,
): RestorableCollectionReceiptRow | null {
  if (!receipt.collectionRecordId || !receipt.storagePath) return null;
  return {
    id: String(receipt.id || crypto.randomUUID()),
    collectionRecordId: String(receipt.collectionRecordId),
    storagePath: String(receipt.storagePath),
    originalFileName: String(receipt.originalFileName || "receipt"),
    originalMimeType: String(receipt.originalMimeType || "application/octet-stream"),
    originalExtension: String(receipt.originalExtension || ""),
    fileSize: Number(receipt.fileSize || 0),
    receiptAmount: parseCollectionAmountToCents(receipt.receiptAmount, { allowZero: true, allowEmpty: true }),
    extractedAmount: parseCollectionAmountToCents(receipt.extractedAmount, { allowZero: true, allowEmpty: true }),
    extractionStatus: String(receipt.extractionStatus || "").trim() || "unprocessed",
    extractionConfidence:
      receipt.extractionConfidence === null ||
      receipt.extractionConfidence === undefined ||
      receipt.extractionConfidence === ""
        ? null
        : Number(receipt.extractionConfidence),
    receiptDate:
      typeof receipt.receiptDate === "string"
        ? receipt.receiptDate.slice(0, 10)
        : toDate(receipt.receiptDate)?.toISOString().slice(0, 10) || null,
    receiptReference: String(receipt.receiptReference || "").trim() || null,
    fileHash: String(receipt.fileHash || "").trim().toLowerCase() || null,
    createdAt: toDate(receipt.createdAt) ?? new Date(),
  };
}

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
  backupDataReader: BackupPayloadReader,
  stats: RestoreStats,
) {
  for (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionRecord>(
    "collectionRecords",
    BACKUP_CHUNK_SIZE,
  )) {
    const rows = chunk
      .map((record) => normalizeBackupCollectionRecord(record))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    stats.collectionRecords.processed += rows.length;
    if (!rows.length) continue;

    const restoredIdValuesSql = sql.join(
      rows.map((row) => sql`(${row.id}::uuid)`),
      sql`, `,
    );
    await tx.execute(sql`
      INSERT INTO ${RESTORED_COLLECTION_RECORD_IDS_TEMP_TABLE} (id)
      VALUES ${restoredIdValuesSql}
      ON CONFLICT (id) DO NOTHING
    `);

    const valuesSql = sql.join(
      rows.map((row) => sql`(
        ${row.id}::uuid,
        ${row.customerName},
        ${row.icNumber},
        ${row.customerPhone},
        ${row.accountNumber},
        ${row.batch},
        ${row.paymentDate}::date,
        ${row.amount},
        ${row.receiptFile},
        ${row.receiptTotalAmount},
        ${row.receiptValidationStatus},
        ${row.receiptValidationMessage},
        ${row.receiptCount},
        ${row.duplicateReceiptFlag},
        ${row.createdByLogin},
        ${row.collectionStaffNickname},
        ${row.staffUsername},
        ${row.createdAt}
      )`),
      sql`, `,
    );

    const insertedResult = await tx.execute(sql`
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
    stats.collectionRecords.skipped += rows.length - insertedCount;
  }
}

export async function restoreCollectionRecordReceiptsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadReader,
  stats: RestoreStats,
) {
  for (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionReceipt>(
    "collectionRecordReceipts",
    BACKUP_CHUNK_SIZE,
  )) {
    const rows = chunk
      .map((receipt) => normalizeBackupCollectionReceipt(receipt))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    stats.collectionRecordReceipts.processed += rows.length;
    if (!rows.length) continue;

    const valuesSql = sql.join(
      rows.map((row) => sql`(
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
    stats.collectionRecordReceipts.skipped += rows.length - insertedCount;
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
  await rebuildCollectionRecordDailyRollups(tx as any);
  await tx.execute(sql`DELETE FROM public.collection_record_daily_rollup_refresh_queue`);
}
