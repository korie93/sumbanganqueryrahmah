import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { normalizeCollectionReceiptExtractionStatus } from "../services/collection/collection-receipt-validation";
import {
  listCollectionRecordReceiptsByIds,
  listCollectionRecordReceiptsByRecordId,
  mapCollectionRecordReceiptRow,
  readRows,
  syncCollectionRecordLegacyReceiptCache,
} from "./collection-receipt-read-utils";
import type { CollectionReceiptExecutor } from "./collection-receipt-read-utils";
import type {
  CollectionRecordReceipt,
  CreateCollectionRecordReceiptInput,
  UpdateCollectionRecordReceiptInput,
} from "../storage-postgres";

function normalizeUniqueValues(values: string[]): string[] {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
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
        extraction_status,
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
        ${normalizeCollectionReceiptExtractionStatus(receipt.extractionStatus)},
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
          extractionStatus: normalizeCollectionReceiptExtractionStatus(update?.extractionStatus),
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
        extraction_status = ${update.extractionStatus},
        extraction_confidence = ${update.extractionConfidence},
        receipt_date = ${update.receiptDate},
        receipt_reference = ${update.receiptReference}
      WHERE collection_record_id = ${normalizedRecordId}::uuid
        AND id = ${update.receiptId}::uuid
        AND deleted_at IS NULL
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
      extraction_status,
      extraction_confidence,
      receipt_date,
      receipt_reference,
      file_hash,
      created_at,
      deleted_at
    FROM public.collection_record_receipts
    WHERE collection_record_id = ${normalizedRecordId}::uuid
      AND id IN (${idSql})
      AND deleted_at IS NULL
  `);
  return readRows<Record<string, unknown>>(existing).map((row) => mapCollectionRecordReceiptRow(row));
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

  const receipts = await listCollectionRecordReceiptsForDeletion(
    executor,
    normalizedRecordId,
    normalizedReceiptIds,
  );
  if (!receipts.length) {
    return [];
  }

  const idSql = sql.join(receipts.map((receipt) => sql`${receipt.id}::uuid`), sql`, `);
  await executor.execute(sql`
    UPDATE public.collection_record_receipts
    SET deleted_at = now()
    WHERE collection_record_id = ${normalizedRecordId}::uuid
      AND id IN (${idSql})
      AND deleted_at IS NULL
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
    UPDATE public.collection_record_receipts
    SET deleted_at = now()
    WHERE id IN (${idSql})
      AND deleted_at IS NULL
  `);
  await syncCollectionRecordLegacyReceiptCache(executor, String(recordId || "").trim());
  return receipts;
}
