import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { parseCollectionAmountToCents } from "../../shared/collection-amount-types";
import {
  buildCollectionReceiptValidationResult,
  normalizeCollectionReceiptExtractionStatus,
} from "../services/collection/collection-receipt-validation";
import { mapCollectionRecordRow } from "./collection-repository-mappers";
import { buildProtectedCollectionPiiSelect } from "./collection-pii-select-utils";
import {
  attachCollectionReceipts,
  findCollectionReceiptDuplicateSummariesByHash,
  listCollectionRecordReceiptsByIds,
  listCollectionRecordReceiptsByRecordId,
  mapCollectionRecordReceiptRow,
  readFirstRow,
  readRows,
  syncCollectionRecordLegacyReceiptCache,
} from "./collection-receipt-read-utils";
import type { CollectionReceiptExecutor } from "./collection-receipt-read-utils";
import type {
  CollectionRecord,
  CollectionRecordReceipt,
  CreateCollectionRecordReceiptInput,
  UpdateCollectionRecordReceiptInput,
} from "../storage-postgres";
export type { CollectionReceiptExecutor } from "./collection-receipt-read-utils";
export {
  attachCollectionReceipts,
  findCollectionReceiptDuplicateSummariesByHash,
  getCollectionRecordReceiptByIdForRecord,
  listCollectionRecordReceiptsByIds,
  listCollectionRecordReceiptsByRecordId,
  loadCollectionReceiptMapByRecordIds,
  mapCollectionRecordReceiptRow,
} from "./collection-receipt-read-utils";

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

  const receipts = await listCollectionRecordReceiptsForDeletion(executor, normalizedRecordId, normalizedReceiptIds);
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

export async function syncCollectionRecordReceiptValidation(
  executor: CollectionReceiptExecutor,
  recordId: string,
): Promise<CollectionRecord | undefined> {
  const normalizedRecordId = String(recordId || "").trim();
  if (!normalizedRecordId) {
    return undefined;
  }

  const recordResult = await executor.execute(sql`
    SELECT amount
    FROM public.collection_records
    WHERE id = ${normalizedRecordId}::uuid
    LIMIT 1
  `);
  const recordRow = readFirstRow<Record<string, unknown>>(recordResult);
  if (!recordRow) {
    return undefined;
  }

  const totalPaidCents = parseCollectionAmountToCents(recordRow.amount, { allowZero: true }) ?? 0;
  const receipts = await listCollectionRecordReceiptsByRecordId(executor, normalizedRecordId);
  const validation = buildCollectionReceiptValidationResult({
    totalPaidCents,
    receipts: receipts.map((receipt) => ({
      receiptId: receipt.id,
      originalFileName: receipt.originalFileName,
      fileHash: receipt.fileHash,
      receiptAmountCents: parseCollectionAmountToCents(receipt.receiptAmount, {
        allowZero: true,
      }),
      extractedAmountCents: parseCollectionAmountToCents(receipt.extractedAmount, {
        allowZero: true,
      }),
      extractionStatus: receipt.extractionStatus,
      extractionConfidence: receipt.extractionConfidence,
      receiptDate: receipt.receiptDate,
      receiptReference: receipt.receiptReference,
    })),
  });
  const duplicateSummaries = await findCollectionReceiptDuplicateSummariesByHash(
    executor,
    receipts.map((receipt) => receipt.fileHash || ""),
  );
  const duplicateReceiptFlag = duplicateSummaries.some((summary) => summary.matchCount > 1);

  await executor.execute(sql`
    UPDATE public.collection_records
    SET
      receipt_total_amount = ${validation.receiptTotalAmountCents},
      receipt_validation_status = ${validation.status},
      receipt_validation_message = ${validation.message},
      receipt_count = ${validation.receiptCount},
      duplicate_receipt_flag = ${duplicateReceiptFlag}
    WHERE id = ${normalizedRecordId}::uuid
  `);

  const refreshed = await executor.execute(sql`
    SELECT
      id,
      ${buildProtectedCollectionPiiSelect("customer_name", "customer_name_encrypted", "customer_name", "customerName")},
      customer_name_encrypted,
      ${buildProtectedCollectionPiiSelect("ic_number", "ic_number_encrypted", "ic_number", "icNumber")},
      ic_number_encrypted,
      ${buildProtectedCollectionPiiSelect("customer_phone", "customer_phone_encrypted", "customer_phone", "customerPhone")},
      customer_phone_encrypted,
      ${buildProtectedCollectionPiiSelect("account_number", "account_number_encrypted", "account_number", "accountNumber")},
      account_number_encrypted,
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
