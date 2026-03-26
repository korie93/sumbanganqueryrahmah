import path from "path";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import type { CollectionRepositoryExecutor, CollectionRepositoryQueryResult } from "./collection-nickname-utils";
import { collectionReceiptFileExists } from "../lib/collection-receipt-files";
import {
  formatCollectionAmountFromCents,
  parseCollectionAmountToCents,
} from "../services/collection/collection-receipt-validation";
import { mapCollectionRecordRow } from "./collection-repository-mappers";
import type {
  CollectionRecord,
  CollectionRecordReceipt,
  CreateCollectionRecordReceiptInput,
  UpdateCollectionRecordReceiptInput,
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
};

export type CollectionReceiptExecutor = CollectionRepositoryExecutor;

// collection_records.receipt_file is kept only as a compatibility cache for legacy rows.
// collection_record_receipts is the authoritative source for receipt ownership/mapping.
async function syncCollectionRecordLegacyReceiptCache(
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

function inferLegacyReceiptMimeType(storagePath: string): string {
  const extension = path.extname(String(storagePath || "").trim()).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

function readRows<TRow>(result: CollectionRepositoryQueryResult): TRow[] {
  return Array.isArray(result.rows) ? (result.rows as TRow[]) : [];
}

function readFirstRow<TRow>(result: CollectionRepositoryQueryResult): TRow | undefined {
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
    extractionConfidence: (() => {
      const value = Number(row.extraction_confidence ?? row.extractionConfidence);
      return Number.isFinite(value) ? value : null;
    })(),
    receiptDate: String(row.receipt_date ?? row.receiptDate ?? "").trim() || null,
    receiptReference: String(row.receipt_reference ?? row.receiptReference ?? "").trim() || null,
    fileHash: String(row.file_hash ?? row.fileHash ?? "").trim() || null,
    createdAt: normalizeCollectionDate(row.created_at ?? row.createdAt),
  };
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
      receipt_amount,
      extracted_amount,
      extraction_confidence,
      receipt_date,
      receipt_reference,
      file_hash,
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
  await pruneMissingCollectionReceiptRelations(executor, receiptMap);

  const legacyOnlyRecords = records.filter((record) => {
    const receipts = receiptMap.get(record.id) || [];
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
      receiptMap.set(recordId, receipts);
    }
  }

  return records.map((record) => {
    const receipts = receiptMap.get(record.id) || [];
    return {
      ...record,
      // collection_record_receipts is the active runtime source of truth.
      receiptFile: null,
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
      receipt_amount,
      extracted_amount,
      extraction_confidence,
      receipt_date,
      receipt_reference,
      file_hash,
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
      receipt_amount,
      extracted_amount,
      extraction_confidence,
      receipt_date,
      receipt_reference,
      file_hash,
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
      receipt_amount,
      extracted_amount,
      extraction_confidence,
      receipt_date,
      receipt_reference,
      file_hash,
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
        receipt_amount,
        extracted_amount,
        extraction_confidence,
        receipt_date,
        receipt_reference,
        file_hash,
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
        ${receipt.receiptAmountCents ?? null},
        ${receipt.extractedAmountCents ?? null},
        ${receipt.extractionConfidence ?? null},
        ${receipt.receiptDate ?? null},
        ${receipt.receiptReference ?? null},
        ${receipt.fileHash ?? null},
        now()
      )
    `);
  }

  await syncCollectionRecordLegacyReceiptCache(executor, normalizedRecordId);
  return listCollectionRecordReceiptsByIds(executor, insertedIds);
}

export async function updateCollectionRecordReceiptRows(
  executor: CollectionReceiptExecutor,
  recordId: string,
  updates: UpdateCollectionRecordReceiptInput[],
): Promise<CollectionRecordReceipt[]> {
  const normalizedRecordId = String(recordId || "").trim();
  const normalizedUpdates = Array.isArray(updates)
    ? updates
        .map((update) => ({
          receiptId: String(update?.receiptId || "").trim(),
          receiptAmountCents: update?.receiptAmountCents ?? null,
          extractedAmountCents: update?.extractedAmountCents ?? null,
          extractionConfidence:
            update?.extractionConfidence === null || update?.extractionConfidence === undefined
              ? null
              : Number(update.extractionConfidence),
          receiptDate: String(update?.receiptDate || "").trim() || null,
          receiptReference: String(update?.receiptReference || "").trim() || null,
        }))
        .filter((update) => Boolean(update.receiptId))
    : [];
  if (!normalizedRecordId || !normalizedUpdates.length) {
    return [];
  }

  for (const update of normalizedUpdates) {
    await executor.execute(sql`
      UPDATE public.collection_record_receipts
      SET
        receipt_amount = ${update.receiptAmountCents},
        extracted_amount = ${update.extractedAmountCents},
        extraction_confidence = ${update.extractionConfidence},
        receipt_date = ${update.receiptDate},
        receipt_reference = ${update.receiptReference}
      WHERE collection_record_id = ${normalizedRecordId}::uuid
        AND id = ${update.receiptId}::uuid
    `);
  }

  return listCollectionRecordReceiptsByIds(
    executor,
    normalizedUpdates.map((update) => update.receiptId),
  );
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
      receipt_amount,
      extracted_amount,
      extraction_confidence,
      receipt_date,
      receipt_reference,
      file_hash,
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
  await syncCollectionRecordLegacyReceiptCache(executor, normalizedRecordId);
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
  await syncCollectionRecordLegacyReceiptCache(executor, String(recordId || "").trim());
  return receipts;
}

export async function syncCollectionRecordReceiptValidation(
  executor: CollectionReceiptExecutor,
  recordId: string,
): Promise<CollectionRecord | undefined> {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId) {
    return undefined;
  }

  const aggregateResult = await executor.execute(sql`
    SELECT
      amount,
      COUNT(receipt.id)::int AS receipt_count,
      COALESCE(SUM(receipt.receipt_amount), 0)::bigint AS receipt_total_amount,
      COUNT(*) FILTER (WHERE receipt.id IS NOT NULL AND receipt.receipt_amount IS NULL)::int AS missing_amount_count
    FROM public.collection_records record
    LEFT JOIN public.collection_record_receipts receipt
      ON receipt.collection_record_id = record.id
    WHERE record.id = ${normalizedRecordId}::uuid
    GROUP BY record.amount
    LIMIT 1
  `);
  const aggregateRow = (aggregateResult.rows?.[0] || null) as Record<string, unknown> | null;
  if (!aggregateRow) {
    return undefined;
  }

  const totalPaidCents = parseCollectionAmountToCents(aggregateRow.amount, { allowZero: true }) ?? 0;
  const receiptCount = Math.max(0, Number(aggregateRow.receipt_count || 0) || 0);
  const receiptTotalAmountCents = Number(aggregateRow.receipt_total_amount || 0);
  const missingAmountCount = Math.max(0, Number(aggregateRow.missing_amount_count || 0) || 0);
  const status =
    receiptCount === 0
      ? "needs_review"
      : missingAmountCount > 0
        ? "needs_review"
        : receiptTotalAmountCents === totalPaidCents
          ? "matched"
          : "mismatch";
  const message =
    receiptCount === 0
      ? "Tiada resit dilampirkan untuk semakan jumlah."
      : missingAmountCount > 0
        ? "Setiap resit perlu disahkan jumlahnya sebelum rekod boleh disimpan."
        : receiptTotalAmountCents === totalPaidCents
          ? "Jumlah resit sepadan dengan jumlah bayaran yang dimasukkan."
          : `Jumlah resit RM ${formatCollectionAmountFromCents(receiptTotalAmountCents)} tidak sepadan dengan jumlah bayaran RM ${formatCollectionAmountFromCents(totalPaidCents)}.`;

  await executor.execute(sql`
    UPDATE public.collection_records
    SET
      receipt_total_amount = ${receiptTotalAmountCents},
      receipt_validation_status = ${status},
      receipt_validation_message = ${message},
      receipt_count = ${receiptCount}
    WHERE id = ${normalizedRecordId}::uuid
  `);

  const refreshed = await executor.execute(sql`
    SELECT
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
      created_by_login,
      collection_staff_nickname,
      staff_username,
      created_at,
      updated_at
    FROM public.collection_records
    WHERE id = ${normalizedRecordId}::uuid
    LIMIT 1
  `);
  const row = readFirstRow<Record<string, unknown>>(refreshed);
  if (!row) {
    return undefined;
  }
  const [hydrated] = await attachCollectionReceipts(executor, [mapCollectionRecordRow(row)]);
  return hydrated;
}
