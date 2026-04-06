import { sql } from "drizzle-orm";
import type {
  CollectionRecordReceipt,
  CollectionReceiptDuplicateSummary,
} from "../storage-postgres";
import {
  mapCollectionRecordReceiptRow,
  normalizeCollectionDate,
  normalizeUniqueValues,
  readFirstRow,
  readRows,
  type CollectionRecordReceiptDbRow,
} from "./collection-receipt-read-shared";
import type { CollectionReceiptExecutor } from "./collection-receipt-attachment-utils";

export async function listCollectionRecordReceiptsByRecordId(
  executor: CollectionReceiptExecutor,
  recordId: string,
): Promise<CollectionRecordReceipt[]> {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId) return [];

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
      created_at,
      deleted_at
    FROM public.collection_record_receipts
    WHERE collection_record_id = ${normalizedRecordId}::uuid
      AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
  `);

  return readRows<CollectionRecordReceiptDbRow>(result).map((row) => mapCollectionRecordReceiptRow(row));
}

export async function getCollectionRecordReceiptByIdForRecord(
  executor: CollectionReceiptExecutor,
  recordId: string,
  receiptId: string,
): Promise<CollectionRecordReceipt | undefined> {
  const normalizedRecordId = String(recordId || "").trim();
  const normalizedReceiptId = String(receiptId || "").trim();
  if (!normalizedRecordId || !normalizedReceiptId) return undefined;

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
      created_at,
      deleted_at
    FROM public.collection_record_receipts
    WHERE collection_record_id = ${normalizedRecordId}::uuid
      AND id = ${normalizedReceiptId}::uuid
    LIMIT 1
  `);
  const row = readFirstRow<CollectionRecordReceiptDbRow>(result);
  if (!row) return undefined;
  return mapCollectionRecordReceiptRow(row);
}

export async function listCollectionRecordReceiptsByIds(
  executor: CollectionReceiptExecutor,
  receiptIds: string[],
): Promise<CollectionRecordReceipt[]> {
  const normalizedReceiptIds = normalizeUniqueValues(receiptIds);
  if (!normalizedReceiptIds.length) return [];

  const idSql = sql.join(normalizedReceiptIds.map((value) => sql`${value}::uuid`), sql`, `);
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
      created_at,
      deleted_at
    FROM public.collection_record_receipts
    WHERE id IN (${idSql})
    ORDER BY created_at ASC, id ASC
  `);
  return readRows<CollectionRecordReceiptDbRow>(result).map((row) => mapCollectionRecordReceiptRow(row));
}

export async function findCollectionReceiptDuplicateSummariesByHash(
  executor: CollectionReceiptExecutor,
  fileHashes: string[],
  options?: { excludeRecordId?: string },
): Promise<CollectionReceiptDuplicateSummary[]> {
  const normalizedHashes = normalizeUniqueValues(fileHashes.map((value) => String(value || "").trim().toLowerCase()));
  if (!normalizedHashes.length) {
    return [];
  }

  const hashSql = sql.join(normalizedHashes.map((value) => sql`${value}`), sql`, `);
  const excludeRecordId = String(options?.excludeRecordId || "").trim();
  const excludeSql = excludeRecordId
    ? sql`AND collection_record_id <> ${excludeRecordId}::uuid`
    : sql``;
  const result = await executor.execute(sql`
    SELECT
      id,
      collection_record_id,
      original_file_name,
      file_hash,
      created_at
    FROM public.collection_record_receipts
    WHERE file_hash IN (${hashSql})
      AND deleted_at IS NULL
      ${excludeSql}
    ORDER BY created_at DESC, id DESC
  `);

  const rows = readRows<Record<string, unknown>>(result);
  const grouped = new Map<string, CollectionReceiptDuplicateSummary>();
  for (const row of rows) {
    const fileHash = String(row.file_hash ?? row.fileHash ?? "").trim().toLowerCase();
    if (!fileHash) {
      continue;
    }
    const current = grouped.get(fileHash) || {
      fileHash,
      matchCount: 0,
      matches: [],
    };
    current.matchCount += 1;
    current.matches.push({
      receiptId: String(row.id ?? ""),
      collectionRecordId: String(row.collection_record_id ?? row.collectionRecordId ?? ""),
      originalFileName: String(row.original_file_name ?? row.originalFileName ?? "receipt"),
      createdAt: normalizeCollectionDate(row.created_at ?? row.createdAt),
    });
    grouped.set(fileHash, current);
  }

  return Array.from(grouped.values())
    .filter((summary) => summary.matchCount > 0)
    .map((summary) => ({
      ...summary,
      matches: summary.matches.slice(0, 5),
    }));
}
