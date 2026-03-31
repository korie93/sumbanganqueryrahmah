import path from "path";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import type { CollectionRepositoryExecutor, CollectionRepositoryQueryResult } from "./collection-nickname-utils";
import { collectionReceiptFileExists } from "../lib/collection-receipt-files";
import {
  formatCollectionAmountFromCents,
  normalizeCollectionReceiptExtractionStatus,
} from "../services/collection/collection-receipt-validation";
import type {
  CollectionRecord,
  CollectionRecordReceipt,
  CollectionReceiptDuplicateSummary,
} from "../storage-postgres";

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
  receipt_amount?: unknown;
  receiptAmount?: unknown;
  extracted_amount?: unknown;
  extractedAmount?: unknown;
  extraction_status?: unknown;
  extractionStatus?: unknown;
  extraction_confidence?: unknown;
  extractionConfidence?: unknown;
  receipt_date?: unknown;
  receiptDate?: unknown;
  receipt_reference?: unknown;
  receiptReference?: unknown;
  file_hash?: unknown;
  fileHash?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  deleted_at?: unknown;
  deletedAt?: unknown;
};

export type CollectionReceiptExecutor = CollectionRepositoryExecutor;

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

function inferLegacyReceiptMimeType(storagePath: string): string {
  const extension = path.extname(String(storagePath || "").trim()).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

export function readRows<TRow>(result: CollectionRepositoryQueryResult): TRow[] {
  return Array.isArray(result.rows) ? (result.rows as TRow[]) : [];
}

export function readFirstRow<TRow>(result: CollectionRepositoryQueryResult): TRow | undefined {
  return readRows<TRow>(result)[0];
}

export function mapCollectionRecordReceiptRow(row: CollectionRecordReceiptDbRow): CollectionRecordReceipt {
  const rawReceiptAmount = row.receipt_amount ?? row.receiptAmount ?? null;
  const rawExtractedAmount = row.extracted_amount ?? row.extractedAmount ?? null;
  return {
    id: String(row.id ?? ""),
    collectionRecordId: String(row.collection_record_id ?? row.collectionRecordId ?? ""),
    storagePath: String(row.storage_path ?? row.storagePath ?? ""),
    originalFileName: String(row.original_file_name ?? row.originalFileName ?? ""),
    originalMimeType: String(row.original_mime_type ?? row.originalMimeType ?? "application/octet-stream"),
    originalExtension: String(row.original_extension ?? row.originalExtension ?? ""),
    fileSize: Number(row.file_size ?? row.fileSize ?? 0),
    receiptAmount:
      rawReceiptAmount === null || rawReceiptAmount === undefined || rawReceiptAmount === ""
        ? null
        : formatCollectionAmountFromCents(rawReceiptAmount),
    extractedAmount:
      rawExtractedAmount === null || rawExtractedAmount === undefined || rawExtractedAmount === ""
        ? null
        : formatCollectionAmountFromCents(rawExtractedAmount),
    extractionStatus: normalizeCollectionReceiptExtractionStatus(
      row.extraction_status ?? row.extractionStatus ?? null,
    ),
    extractionConfidence: (() => {
      const value = Number(row.extraction_confidence ?? row.extractionConfidence);
      return Number.isFinite(value) ? value : null;
    })(),
    receiptDate: String(row.receipt_date ?? row.receiptDate ?? "").trim() || null,
    receiptReference: String(row.receipt_reference ?? row.receiptReference ?? "").trim() || null,
    fileHash: String(row.file_hash ?? row.fileHash ?? "").trim() || null,
    createdAt: normalizeCollectionDate(row.created_at ?? row.createdAt),
    deletedAt:
      row.deleted_at === null || row.deletedAt === null || row.deleted_at === undefined || row.deletedAt === undefined
        ? null
        : normalizeCollectionDate(row.deleted_at ?? row.deletedAt),
  };
}

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

  if (!(await collectionReceiptFileExists(legacyStoragePath))) {
    await syncCollectionRecordLegacyReceiptCache(executor, normalizedRecordId);
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

async function pruneMissingCollectionReceiptRelations(
  executor: CollectionReceiptExecutor,
  receiptMap: Map<string, CollectionRecordReceipt[]>,
): Promise<void> {
  for (const [recordId, receipts] of receiptMap.entries()) {
    if (!receipts.length) continue;

    const validReceipts: CollectionRecordReceipt[] = [];
    const missingReceiptIds: string[] = [];

    for (const receipt of receipts) {
      if (await collectionReceiptFileExists(receipt.storagePath)) {
        validReceipts.push(receipt);
      } else {
        missingReceiptIds.push(receipt.id);
      }
    }

    if (!missingReceiptIds.length) {
      continue;
    }

    const idSql = sql.join(missingReceiptIds.map((value) => sql`${value}::uuid`), sql`, `);
    await executor.execute(sql`
      DELETE FROM public.collection_record_receipts
      WHERE collection_record_id = ${recordId}::uuid
        AND id IN (${idSql})
    `);
    await syncCollectionRecordLegacyReceiptCache(executor, recordId);
    receiptMap.set(recordId, validReceipts);
  }
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
  await pruneMissingCollectionReceiptRelations(executor, activeReceiptMap);

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
