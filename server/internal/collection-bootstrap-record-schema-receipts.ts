import { randomUUID } from "node:crypto";
import path from "node:path";
import { sql } from "drizzle-orm";
import { buildCollectionAmountMyrToCentsSql } from "../repositories/collection-amount-sql";
import {
  executeBootstrapStatements,
  inferMimeTypeFromReceiptPath,
  type BootstrapSqlExecutor,
} from "./collection-bootstrap-records-shared";

export async function backfillLegacyCollectionReceipts(database: BootstrapSqlExecutor): Promise<void> {
  const legacyReceiptRows = await database.execute(sql`
    SELECT
      id,
      receipt_file,
      created_at
    FROM public.collection_records cr
    WHERE trim(COALESCE(cr.receipt_file, '')) <> ''
      AND NOT EXISTS (
      SELECT 1
      FROM public.collection_record_receipts crr
      WHERE crr.collection_record_id = cr.id
        AND crr.storage_path = cr.receipt_file
        AND crr.deleted_at IS NULL
      )
    LIMIT 10000
  `);

  for (const row of legacyReceiptRows.rows as Array<{ id?: string; receipt_file?: string; created_at?: Date | string }>) {
    const collectionRecordId = String(row.id || "").trim();
    const storagePath = String(row.receipt_file || "").trim();
    if (!collectionRecordId || !storagePath) continue;
    const fileName = path.basename(storagePath);
    const createdAt = row.created_at ? new Date(row.created_at) : new Date();
    const extension = path.extname(fileName).toLowerCase();
    await database.execute(sql`
      INSERT INTO public.collection_record_receipts (
        id,
        collection_record_id,
        storage_path,
        original_file_name,
        original_mime_type,
        original_extension,
        file_size,
        created_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${collectionRecordId}::uuid,
        ${storagePath},
        ${fileName || "receipt"},
        ${inferMimeTypeFromReceiptPath(storagePath)},
        ${extension},
        0,
        ${createdAt}
      )
      ON CONFLICT (collection_record_id, storage_path) DO NOTHING
    `);
  }
}

export async function syncCollectionReceiptValidation(database: BootstrapSqlExecutor): Promise<void> {
  const recordAmountCentsSql = buildCollectionAmountMyrToCentsSql(sql.raw("record.amount"));

  await executeBootstrapStatements(database, [
    sql`
      UPDATE public.collection_records record
      SET
        receipt_total_amount = COALESCE(stats.receipt_total_amount, 0),
        receipt_count = COALESCE(stats.receipt_count, 0),
        duplicate_receipt_flag = COALESCE(stats.duplicate_receipt_flag, false),
        receipt_validation_status = CASE
          WHEN COALESCE(stats.receipt_count, 0) = 0 THEN 'unverified'
          WHEN COALESCE(stats.missing_amount_count, 0) > 0 THEN 'unverified'
          WHEN COALESCE(stats.receipt_total_amount, 0) < ${recordAmountCentsSql} THEN 'underpaid'
          WHEN COALESCE(stats.receipt_total_amount, 0) > ${recordAmountCentsSql} THEN 'overpaid'
          ELSE 'matched'
        END,
        receipt_validation_message = CASE
          WHEN COALESCE(stats.receipt_count, 0) = 0 THEN 'Tiada resit dilampirkan untuk semakan jumlah.'
          WHEN COALESCE(stats.missing_amount_count, 0) > 0 THEN 'Setiap resit perlu disahkan jumlahnya sebelum rekod boleh disimpan.'
          WHEN COALESCE(stats.receipt_total_amount, 0) < ${recordAmountCentsSql} THEN 'Jumlah resit lebih rendah daripada jumlah bayaran yang dimasukkan.'
          WHEN COALESCE(stats.receipt_total_amount, 0) > ${recordAmountCentsSql} THEN 'Jumlah resit melebihi jumlah bayaran yang dimasukkan.'
          ELSE 'Jumlah resit sepadan dengan jumlah bayaran yang dimasukkan.'
        END
      FROM (
        SELECT
          collection_record_id,
          COUNT(*)::int AS receipt_count,
          COALESCE(SUM(receipt_amount), 0)::bigint AS receipt_total_amount,
          COUNT(*) FILTER (WHERE receipt_amount IS NULL)::int AS missing_amount_count,
          COALESCE(BOOL_OR(COALESCE(hash_stats.match_count, 0) > 1), false) AS duplicate_receipt_flag
        FROM public.collection_record_receipts
        LEFT JOIN (
          SELECT file_hash, COUNT(*)::int AS match_count
          FROM public.collection_record_receipts
          WHERE NULLIF(trim(COALESCE(file_hash, '')), '') IS NOT NULL
            AND deleted_at IS NULL
          GROUP BY file_hash
        ) hash_stats
          ON hash_stats.file_hash = public.collection_record_receipts.file_hash
        WHERE public.collection_record_receipts.deleted_at IS NULL
        GROUP BY collection_record_id
      ) stats
      WHERE record.id = stats.collection_record_id
    `,
    sql`
      UPDATE public.collection_records
      SET
        receipt_total_amount = 0,
        receipt_count = 0,
        duplicate_receipt_flag = false,
        receipt_validation_status = 'unverified',
        receipt_validation_message = 'Tiada resit dilampirkan untuk semakan jumlah.'
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.collection_record_receipts receipt
        WHERE receipt.collection_record_id = public.collection_records.id
          AND receipt.deleted_at IS NULL
      )
    `,
  ]);
}
