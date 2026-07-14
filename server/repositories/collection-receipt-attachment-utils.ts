import { randomUUID } from "crypto";
import path from "path";
import { sql } from "drizzle-orm";
import type { CollectionRepositoryExecutor } from "./collection-nickname-utils";
import { resolveCollectionReceiptStoragePath } from "../lib/collection-receipt-files";
import type { CollectionRecord, CollectionRecordReceipt } from "../storage-postgres";
import {
  inferLegacyReceiptMimeType,
  mapCollectionRecordReceiptRow,
  normalizeCollectionDate,
  normalizeUniqueValues,
  readRows,
  type CollectionRecordReceiptDbRow,
} from "./collection-receipt-read-shared";

export type CollectionReceiptExecutor = CollectionRepositoryExecutor;

export async function syncCollectionRecordLegacyReceiptCache(
  executor: CollectionReceiptExecutor,
  recordId: string,
): Promise<void> {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId) return;

  const firstReceiptResult = await executor.execute(sql`
    SELECT storage_path
    FROM public.collection_record_receipts
    WHERE collection_record_id = ${normalizedRecordId}::uuid
      AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `);

  const firstPath = String(
    (firstReceiptResult.rows?.[0] as { storage_path?: string; storagePath?: string } | undefined)?.storage_path
    ?? (firstReceiptResult.rows?.[0] as { storage_path?: string; storagePath?: string } | undefined)?.storagePath
    ?? "",
  ).trim();

  await executor.execute(sql`
    UPDATE public.collection_records
    SET receipt_file = ${firstPath || null}
    WHERE id = ${normalizedRecordId}::uuid
  `);
}

async function promoteLegacyReceiptRelationRow(
  executor: CollectionReceiptExecutor,
  record: Pick<CollectionRecord, "id" | "receiptFile" | "createdAt">,
): Promise<void> {
  const normalizedRecordId = String(record.id || "").trim();
  const legacyStoragePath = String(record.receiptFile || "").trim();
  if (!normalizedRecordId || !legacyStoragePath) {
    return;
  }

  if (!resolveCollectionReceiptStoragePath(legacyStoragePath)) {
    return;
  }

  const originalFileName = path.basename(legacyStoragePath) || "receipt";
  const originalExtension = path.extname(originalFileName).toLowerCase();
  const createdAt = normalizeCollectionDate(record.createdAt);

  await executor.execute(sql`
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
      ${normalizedRecordId}::uuid,
      ${legacyStoragePath},
      ${originalFileName},
      ${inferLegacyReceiptMimeType(legacyStoragePath)},
      ${originalExtension},
      0,
      ${createdAt}
    )
    ON CONFLICT (collection_record_id, storage_path) DO NOTHING
  `);

  await syncCollectionRecordLegacyReceiptCache(executor, normalizedRecordId);
}

export async function loadCollectionReceiptMapByRecordIds(
  executor: CollectionReceiptExecutor,
  recordIds: string[],
  options?: {
    includeDeleted?: boolean;
    deletedOnly?: boolean;
  },
): Promise<Map<string, CollectionRecordReceipt[]>> {
  const normalizedIds = normalizeUniqueValues(recordIds);
  const receiptMap = new Map<string, CollectionRecordReceipt[]>();
  if (!normalizedIds.length) return receiptMap;
  const includeDeleted = options?.includeDeleted === true;
  const deletedOnly = options?.deletedOnly === true;
  const deletedWhereSql = deletedOnly
    ? sql`AND deleted_at IS NOT NULL`
    : includeDeleted
      ? sql``
      : sql`AND deleted_at IS NULL`;

  const idSql = sql.join(normalizedIds.map((value) => sql`${value}::uuid`), sql`, `);
  const result = await executor.execute(sql`
    SELECT
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
      , deleted_at
    FROM public.collection_record_receipts
    WHERE collection_record_id IN (${idSql})
      ${deletedWhereSql}
    ORDER BY created_at ASC, id ASC
  `);

  for (const row of readRows<CollectionRecordReceiptDbRow>(result)) {
    const receipt = mapCollectionRecordReceiptRow(row);
    const current = receiptMap.get(receipt.collectionRecordId) || [];
    current.push(receipt);
    receiptMap.set(receipt.collectionRecordId, current);
  }

  return receiptMap;
}

export async function attachCollectionReceipts(
  executor: CollectionReceiptExecutor,
  records: CollectionRecord[],
): Promise<CollectionRecord[]> {
  if (!records.length) return records;
  const activeReceiptMap = await loadCollectionReceiptMapByRecordIds(
    executor,
    records.map((record) => record.id),
  );

  const legacyOnlyRecords = records.filter((record) => {
    const receipts = activeReceiptMap.get(record.id) || [];
    return receipts.length === 0 && Boolean(String(record.receiptFile || "").trim());
  });

  if (legacyOnlyRecords.length > 0) {
    for (const record of legacyOnlyRecords) {
      await promoteLegacyReceiptRelationRow(executor, record);
    }

    const refreshedReceiptMap = await loadCollectionReceiptMapByRecordIds(
      executor,
      legacyOnlyRecords.map((record) => record.id),
    );
    for (const [recordId, receipts] of refreshedReceiptMap.entries()) {
      activeReceiptMap.set(recordId, receipts);
    }
  }

  const archivedReceiptMap = await loadCollectionReceiptMapByRecordIds(
    executor,
    records.map((record) => record.id),
    { deletedOnly: true },
  );

  return records.map((record) => {
    const receipts = activeReceiptMap.get(record.id) || [];
    const archivedReceipts = archivedReceiptMap.get(record.id) || [];
    return {
      ...record,
      receiptFile: null,
      receipts,
      archivedReceipts,
    };
  });
}
