import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import type { CollectionRepositoryExecutor, CollectionRepositoryQueryResult } from "./collection-nickname-utils";
import type { CollectionRecord, CollectionRecordReceipt, CreateCollectionRecordReceiptInput } from "../storage-postgres";

type CollectionRecordReceiptDbRow = {
  id?: unknown;
  collection_record_id?: unknown;
  collectionRecordId?: unknown;
  storage_path?: unknown;
  storagePath?: unknown;
  original_file_name?: unknown;
  originalFileName?: unknown;
  original_mime_type?: unknown;
  originalMimeType?: unknown;
  original_extension?: unknown;
  originalExtension?: unknown;
  file_size?: unknown;
  fileSize?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
};

export type CollectionReceiptExecutor = CollectionRepositoryExecutor;

async function syncCollectionRecordPrimaryReceiptPath(
  executor: CollectionReceiptExecutor,
  recordId: string,
): Promise<void> {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId) return;

  const firstReceiptResult = await executor.execute(sql`
    SELECT storage_path
    FROM public.collection_record_receipts
    WHERE collection_record_id = ${normalizedRecordId}::uuid
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

function normalizeUniqueValues(values: string[]): string[] {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeCollectionDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date();
}

function readRows<TRow>(result: CollectionRepositoryQueryResult): TRow[] {
  return Array.isArray(result.rows) ? (result.rows as TRow[]) : [];
}

function readFirstRow<TRow>(result: CollectionRepositoryQueryResult): TRow | undefined {
  return readRows<TRow>(result)[0];
}

export function mapCollectionRecordReceiptRow(row: CollectionRecordReceiptDbRow): CollectionRecordReceipt {
  return {
    id: String(row.id ?? ""),
    collectionRecordId: String(row.collection_record_id ?? row.collectionRecordId ?? ""),
    storagePath: String(row.storage_path ?? row.storagePath ?? ""),
    originalFileName: String(row.original_file_name ?? row.originalFileName ?? ""),
    originalMimeType: String(row.original_mime_type ?? row.originalMimeType ?? "application/octet-stream"),
    originalExtension: String(row.original_extension ?? row.originalExtension ?? ""),
    fileSize: Number(row.file_size ?? row.fileSize ?? 0),
    createdAt: normalizeCollectionDate(row.created_at ?? row.createdAt),
  };
}

export async function loadCollectionReceiptMapByRecordIds(
  executor: CollectionReceiptExecutor,
  recordIds: string[],
): Promise<Map<string, CollectionRecordReceipt[]>> {
  const normalizedIds = normalizeUniqueValues(recordIds);
  const receiptMap = new Map<string, CollectionRecordReceipt[]>();
  if (!normalizedIds.length) return receiptMap;

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
      created_at
    FROM public.collection_record_receipts
    WHERE collection_record_id IN (${idSql})
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
  const receiptMap = await loadCollectionReceiptMapByRecordIds(
    executor,
    records.map((record) => record.id),
  );

  return records.map((record) => {
    const receipts = receiptMap.get(record.id) || [];
    const firstReceiptPath = receipts[0]?.storagePath || record.receiptFile || null;
    return {
      ...record,
      receiptFile: firstReceiptPath,
      receipts,
    };
  });
}

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
      created_at
    FROM public.collection_record_receipts
    WHERE collection_record_id = ${normalizedRecordId}::uuid
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
      created_at
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
      created_at
    FROM public.collection_record_receipts
    WHERE id IN (${idSql})
    ORDER BY created_at ASC, id ASC
  `);
  return readRows<CollectionRecordReceiptDbRow>(result).map((row) => mapCollectionRecordReceiptRow(row));
}

export async function createCollectionRecordReceiptRows(
  executor: CollectionReceiptExecutor,
  recordId: string,
  receipts: CreateCollectionRecordReceiptInput[],
): Promise<CollectionRecordReceipt[]> {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId || !Array.isArray(receipts) || !receipts.length) {
    return [];
  }

  const insertedIds: string[] = [];
  for (const receipt of receipts) {
    const id = randomUUID();
    insertedIds.push(id);
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
        ${id}::uuid,
        ${normalizedRecordId}::uuid,
        ${receipt.storagePath},
        ${receipt.originalFileName},
        ${receipt.originalMimeType},
        ${receipt.originalExtension},
        ${receipt.fileSize},
        now()
      )
    `);
  }

  await syncCollectionRecordPrimaryReceiptPath(executor, normalizedRecordId);
  return listCollectionRecordReceiptsByIds(executor, insertedIds);
}

export async function listCollectionRecordReceiptsForDeletion(
  executor: CollectionReceiptExecutor,
  recordId: string,
  receiptIds: string[],
): Promise<CollectionRecordReceipt[]> {
  const normalizedRecordId = String(recordId || "").trim();
  const normalizedReceiptIds = normalizeUniqueValues(receiptIds);
  if (!normalizedRecordId || !normalizedReceiptIds.length) {
    return [];
  }

  const idSql = sql.join(normalizedReceiptIds.map((value) => sql`${value}::uuid`), sql`, `);
  const existing = await executor.execute(sql`
    SELECT
      id,
      collection_record_id,
      storage_path,
      original_file_name,
      original_mime_type,
      original_extension,
      file_size,
      created_at
    FROM public.collection_record_receipts
    WHERE collection_record_id = ${normalizedRecordId}::uuid
      AND id IN (${idSql})
  `);
  return readRows<CollectionRecordReceiptDbRow>(existing).map((row) => mapCollectionRecordReceiptRow(row));
}

export async function deleteCollectionRecordReceiptRows(
  executor: CollectionReceiptExecutor,
  recordId: string,
  receiptIds: string[],
): Promise<CollectionRecordReceipt[]> {
  const normalizedRecordId = String(recordId || "").trim();
  const normalizedReceiptIds = normalizeUniqueValues(receiptIds);
  if (!normalizedRecordId || !normalizedReceiptIds.length) {
    return [];
  }

  const receipts = await listCollectionRecordReceiptsForDeletion(executor, normalizedRecordId, normalizedReceiptIds);
  if (!receipts.length) {
    return [];
  }

  const idSql = sql.join(normalizedReceiptIds.map((value) => sql`${value}::uuid`), sql`, `);
  await executor.execute(sql`
    DELETE FROM public.collection_record_receipts
    WHERE collection_record_id = ${normalizedRecordId}::uuid
      AND id IN (${idSql})
  `);
  await syncCollectionRecordPrimaryReceiptPath(executor, normalizedRecordId);
  return receipts;
}

export async function deleteAllCollectionRecordReceiptRows(
  executor: CollectionReceiptExecutor,
  recordId: string,
): Promise<CollectionRecordReceipt[]> {
  const receipts = await listCollectionRecordReceiptsByRecordId(executor, recordId);
  if (!receipts.length) {
    return [];
  }
  const idSql = sql.join(receipts.map((receipt) => sql`${receipt.id}::uuid`), sql`, `);
  await executor.execute(sql`
    DELETE FROM public.collection_record_receipts
    WHERE id IN (${idSql})
  `);
  await syncCollectionRecordPrimaryReceiptPath(executor, String(recordId || "").trim());
  return receipts;
}
