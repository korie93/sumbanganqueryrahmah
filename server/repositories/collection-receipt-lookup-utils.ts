import { sql } from "drizzle-orm";
import { formatCollectionAmountFromCents } from "../../shared/collection-amount-types";
import type { CollectionReceiptComparison } from "../../shared/collection-receipt-breakdown";
import { resolveCollectionPiiFieldValueFailClosed } from "../lib/collection-pii-encryption";
import { buildProtectedCollectionPiiSelect } from "./collection-pii-select-utils";
import { hydrateCollectionRecordSourceAccounts } from "./collection-record-source-account-utils";
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

export async function findSharedReceiptPair(
  executor: CollectionReceiptExecutor, recordId: string, receiptId: string, relatedRecordId: string,
): Promise<CollectionReceiptComparison | null> {
  // Both attachments must still be active in the same database snapshot.
  const result = await executor.execute(sql`
    WITH pair AS (
      SELECT a.id AS original_id, b.id AS related_id
      FROM public.collection_record_receipts a
      JOIN public.collection_record_receipts b ON b.file_hash = a.file_hash
      WHERE a.collection_record_id = ${recordId}::uuid AND a.id = ${receiptId}::uuid
        AND b.collection_record_id = ${relatedRecordId}::uuid AND b.collection_record_id <> a.collection_record_id
        AND a.file_hash <> '' AND a.deleted_at IS NULL AND b.deleted_at IS NULL
    )
    SELECT file.id = pair.original_id AS original, record.batch, record.payment_date::text,
           record.amount::text, file.receipt_amount, file.original_file_name
    FROM pair
    JOIN public.collection_record_receipts file ON file.id IN (pair.original_id, pair.related_id)
    JOIN public.collection_records record ON record.id = file.collection_record_id
  `);
  const rows = readRows<{
    original: boolean; batch: string; payment_date: string; amount: string;
    receipt_amount: string | null; original_file_name: string;
  }>(result);
  const original = rows.find(row => row.original);
  const related = rows.find(row => !row.original);
  if (rows.length !== 2 || !original || !related) return null;
  const entry = (row: (typeof rows)[number]) => ({
    batch: row.batch, paymentDate: row.payment_date, recordedAmount: row.amount,
    receiptAmount: row.receipt_amount == null ? null : formatCollectionAmountFromCents(row.receipt_amount),
    fileName: row.original_file_name,
  });
  return { original: entry(original), related: entry(related) };
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
  options?: { excludeRecordId?: string; includeRecordDetails?: boolean },
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

  const summaries = Array.from(grouped.values())
    .filter((summary) => summary.matchCount > 0)
    .map((summary) => ({
      ...summary,
      matches: summary.matches.slice(0, 5),
    }));
  if (!options?.includeRecordDetails || !summaries.length) return summaries;

  const ids = [...new Set(summaries.flatMap(summary => summary.matches.map(match => match.collectionRecordId)))];
  const details = await executor.execute(sql`
    SELECT id, batch, payment_date::text, card_number_last4, source_import_id,
      source_data_row_id, source_obligation_key, account_number_encrypted,
      ${buildProtectedCollectionPiiSelect("account_number", "account_number_encrypted", "account_number", "accountNumber")}
    FROM public.collection_records
    WHERE id IN (${sql.join(ids.map(id => sql`${id}::uuid`), sql`, `)})
  `);
  const records = await hydrateCollectionRecordSourceAccounts(executor, readRows<{
    id: string; batch: string; payment_date: string; card_number_last4: string | null;
    source_import_id: string | null; source_data_row_id: string | null; source_obligation_key: string | null;
    account_number: string | null; account_number_encrypted: string | null;
  }>(details).map(row => ({
    id: row.id, batch: row.batch, paymentDate: row.payment_date,
    cardNumberLast4: row.card_number_last4, sourceImportId: row.source_import_id,
    sourceDataRowId: row.source_data_row_id, sourceObligationKey: row.source_obligation_key,
    accountNumber: resolveCollectionPiiFieldValueFailClosed({
      field: "accountNumber", plaintext: row.account_number, encrypted: row.account_number_encrypted,
    }),
  })));
  const links = new Map(records.map(record => [record.id, {
    recordId: record.id, batch: record.batch, paymentDate: record.paymentDate,
    accountLast4: record.accountNumber.trim().match(/\d{4}$/)?.[0] ?? null,
    cardLast4: /^\d{4}$/.test(record.cardNumberLast4 ?? "") ? record.cardNumberLast4 : null,
  }]));
  for (const summary of summaries) {
    for (const match of summary.matches) {
      const link = links.get(match.collectionRecordId);
      if (link) match.record = link;
    }
  }
  return summaries;
}
