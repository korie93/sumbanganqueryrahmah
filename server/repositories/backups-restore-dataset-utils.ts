import crypto from "crypto";
import { sql } from "drizzle-orm";
import type {
  AuditLog,
  DataRow,
  Import,
} from "../../shared/schema-postgres";
import { auditLogs, dataRows, imports, users } from "../../shared/schema-postgres";
import { parseCollectionAmountToCents } from "../services/collection/collection-receipt-validation";
import {
  BACKUP_CHUNK_SIZE,
  type BackupCollectionReceipt,
  type BackupCollectionRecord,
  type BackupDataPayload,
  type BackupUserRecord,
  type RestoreStats,
  createRestoreDatasetStats,
} from "./backups-repository-types";
import { rebuildCollectionRecordDailyRollups } from "./collection-record-repository-utils";

type BackupPayloadReader = {
  getArray<T>(key: keyof BackupDataPayload): T[];
  iterateArrayChunks<T>(key: keyof BackupDataPayload, chunkSize: number): Generator<T[]>;
};

type BackupRestoreExecutor = {
  execute: (query: unknown) => Promise<{ rows?: Array<Record<string, unknown>> }>;
  insert: (...args: any[]) => any;
};

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value as any);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function chunkArray<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

const RESTORED_COLLECTION_RECORD_IDS_TEMP_TABLE = sql.raw("sqr_restored_collection_record_ids");

export function createRestoreStats(): RestoreStats {
  return {
    imports: createRestoreDatasetStats(),
    dataRows: createRestoreDatasetStats(),
    users: createRestoreDatasetStats(),
    auditLogs: createRestoreDatasetStats(),
    collectionRecords: createRestoreDatasetStats(),
    collectionRecordReceipts: createRestoreDatasetStats(),
    warnings: [],
    totalProcessed: 0,
    totalInserted: 0,
    totalSkipped: 0,
    totalReactivated: 0,
  };
}

export function updateRestoreTotals(stats: RestoreStats) {
  const datasets = [
    stats.imports,
    stats.dataRows,
    stats.users,
    stats.auditLogs,
    stats.collectionRecords,
    stats.collectionRecordReceipts,
  ];
  stats.totalProcessed = datasets.reduce((sum, item) => sum + item.processed, 0);
  stats.totalInserted = datasets.reduce((sum, item) => sum + item.inserted, 0);
  stats.totalSkipped = datasets.reduce((sum, item) => sum + item.skipped, 0);
  stats.totalReactivated = datasets.reduce((sum, item) => sum + item.reactivated, 0);
}

export async function restoreImportsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadReader,
  stats: RestoreStats,
) {
  for (const chunk of backupDataReader.iterateArrayChunks<Import>("imports", BACKUP_CHUNK_SIZE)) {
    const rows = chunk.map((record) => ({
      id: record.id,
      name: record.name,
      filename: record.filename,
      createdAt: toDate((record as any).createdAt) ?? new Date(),
      isDeleted: false,
      createdBy: (record as any).createdBy ?? null,
    }));

    stats.imports.processed += rows.length;
    if (!rows.length) continue;

    const importIds = rows.map((row) => row.id);
    const reactivatedResult = await tx.execute(sql`
      UPDATE public.imports
      SET is_deleted = false
      WHERE id IN (${sql.join(importIds.map((value) => sql`${value}`), sql`, `)})
        AND is_deleted = true
      RETURNING id
    `);
    const reactivatedCount = reactivatedResult.rows?.length || 0;
    const insertedRows = await tx
      .insert(imports)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: imports.id });
    stats.imports.reactivated += reactivatedCount;
    stats.imports.inserted += insertedRows.length;
    stats.imports.skipped += rows.length - insertedRows.length - reactivatedCount;
  }
}

export async function restoreDataRowsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadReader,
  stats: RestoreStats,
) {
  for (const chunk of backupDataReader.iterateArrayChunks<DataRow>("dataRows", BACKUP_CHUNK_SIZE)) {
    const rows = chunk.map((row) => ({
      id: row.id ?? crypto.randomUUID(),
      importId: row.importId,
      jsonDataJsonb: row.jsonDataJsonb,
    }));
    stats.dataRows.processed += rows.length;
    if (!rows.length) continue;
    const insertedRows = await tx
      .insert(dataRows)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: dataRows.id });
    stats.dataRows.inserted += insertedRows.length;
    stats.dataRows.skipped += rows.length - insertedRows.length;
  }
}

export async function restoreUsersFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadReader,
  stats: RestoreStats,
) {
  for (const chunk of backupDataReader.iterateArrayChunks<BackupUserRecord>("users", BACKUP_CHUNK_SIZE)) {
    const now = new Date();
    const rows = chunk
      .filter((user) => Boolean(user.passwordHash))
      .map((user) => ({
        id: crypto.randomUUID(),
        username: String(user.username || "").trim().toLowerCase(),
        passwordHash: user.passwordHash!,
        role: user.role || "user",
        createdAt: now,
        updatedAt: now,
        passwordChangedAt: now,
        isBanned: user.isBanned ?? false,
        twoFactorEnabled: user.twoFactorEnabled === true,
        twoFactorSecretEncrypted: user.twoFactorSecretEncrypted ?? null,
        twoFactorConfiguredAt: toDate(user.twoFactorConfiguredAt) ?? null,
        failedLoginAttempts: Math.max(0, Number(user.failedLoginAttempts || 0)),
        lockedAt: toDate(user.lockedAt) ?? null,
        lockedReason: String(user.lockedReason || "").trim() || null,
        lockedBySystem: user.lockedBySystem === true,
      }))
      .filter((user) => user.username !== "");
    stats.users.processed += rows.length;
    const skippedInChunk = chunk.length - rows.length;
    if (skippedInChunk > 0 && stats.warnings.length < 200) {
      stats.warnings.push(`${skippedInChunk} user rows skipped because username/passwordHash is invalid.`);
    }
    stats.users.skipped += skippedInChunk;
    if (!rows.length) continue;
    const insertedRows = await tx
      .insert(users)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: users.id });
    stats.users.inserted += insertedRows.length;
    stats.users.skipped += rows.length - insertedRows.length;
  }
}

export async function restoreAuditLogsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadReader,
  stats: RestoreStats,
) {
  for (const chunk of backupDataReader.iterateArrayChunks<AuditLog>("auditLogs", BACKUP_CHUNK_SIZE)) {
    const rows = chunk.map((log) => ({
      id: (log as any).id ?? crypto.randomUUID(),
      action: log.action,
      performedBy: log.performedBy,
      targetUser: log.targetUser ?? null,
      targetResource: log.targetResource ?? null,
      details: log.details ?? null,
      timestamp: toDate((log as any).timestamp) ?? new Date(),
    }));

    stats.auditLogs.processed += rows.length;
    if (!rows.length) continue;
    const insertedRows = await tx
      .insert(auditLogs)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: auditLogs.id });
    stats.auditLogs.inserted += insertedRows.length;
    stats.auditLogs.skipped += rows.length - insertedRows.length;
  }
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
      .map((record) => {
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
      })
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
      .map((receipt) => {
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
            receipt.extractionConfidence === null || receipt.extractionConfidence === undefined || receipt.extractionConfidence === ""
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
      })
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
