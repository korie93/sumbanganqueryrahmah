import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { resolveCollectionReceiptStoragePath } from "../lib/collection-receipt-files";
import type { InspectedCollectionReceiptRecoveryCandidate } from "./collection-receipt-recovery-utils";

const RECOVERY_BATCH_SIZE = 250;
const RECEIPT_RECOVERY_LOCK_KEY = "sqr:collection-receipt-metadata-recovery";

export type CollectionReceiptRecoveryQueryResult = {
  rows?: readonly unknown[];
};

export type ExecuteCollectionReceiptRecoveryQuery = (
  query: SQL,
) => Promise<CollectionReceiptRecoveryQueryResult>;

export type CollectionReceiptRecoveryDatabaseStats = {
  inspectedCandidates: number;
  missingCollectionRecords: number;
  alreadyActive: number;
  alreadyArchived: number;
  recoverable: number;
  inserted: number;
  conflictSkipped: number;
  recordsRefreshed: number;
};

type ExistingReceiptRow = {
  recordId?: unknown;
  storagePath?: unknown;
  deletedAt?: unknown;
};

type InsertedReceiptRow = {
  recordId?: unknown;
};

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function normalizeRowText(value: unknown): string {
  return String(value ?? "").trim();
}

function createReceiptKey(recordId: string, storagePath: string): string {
  return `${recordId}\u0000${storagePath}`;
}

function readRows<T>(result: CollectionReceiptRecoveryQueryResult): T[] {
  return Array.isArray(result.rows) ? result.rows as T[] : [];
}

async function classifyCandidateBatch(
  execute: ExecuteCollectionReceiptRecoveryQuery,
  candidates: InspectedCollectionReceiptRecoveryCandidate[],
) {
  const recordIds = Array.from(new Set(candidates.map((candidate) => candidate.collectionRecordId)));
  const recordIdSql = sql.join(recordIds.map((recordId) => sql`${recordId}::uuid`), sql`, `);
  const result = await execute(sql`
    SELECT
      record.id::text as "recordId",
      receipt.storage_path as "storagePath",
      receipt.deleted_at as "deletedAt"
    FROM public.collection_records record
    LEFT JOIN public.collection_record_receipts receipt
      ON receipt.collection_record_id = record.id
    WHERE record.id IN (${recordIdSql})
  `);

  const existingRecordIds = new Set<string>();
  const activeReceiptKeys = new Set<string>();
  const archivedReceiptKeys = new Set<string>();
  for (const row of readRows<ExistingReceiptRow>(result)) {
    const recordId = normalizeRowText(row.recordId).toLowerCase();
    if (!recordId) continue;
    existingRecordIds.add(recordId);
    const storagePath = normalizeRowText(row.storagePath);
    if (!storagePath) continue;
    const canonicalStoragePath = resolveCollectionReceiptStoragePath(storagePath)?.publicPath ?? storagePath;
    const key = createReceiptKey(recordId, canonicalStoragePath);
    if (row.deletedAt === null || row.deletedAt === undefined || row.deletedAt === "") {
      activeReceiptKeys.add(key);
    } else {
      archivedReceiptKeys.add(key);
    }
  }

  const recoverable: InspectedCollectionReceiptRecoveryCandidate[] = [];
  let missingCollectionRecords = 0;
  let alreadyActive = 0;
  let alreadyArchived = 0;
  for (const candidate of candidates) {
    if (!existingRecordIds.has(candidate.collectionRecordId)) {
      missingCollectionRecords += 1;
      continue;
    }
    const key = createReceiptKey(candidate.collectionRecordId, candidate.storagePath);
    if (activeReceiptKeys.has(key)) {
      alreadyActive += 1;
      continue;
    }
    if (archivedReceiptKeys.has(key)) {
      alreadyArchived += 1;
      continue;
    }
    recoverable.push(candidate);
  }

  return {
    recoverable,
    missingCollectionRecords,
    alreadyActive,
    alreadyArchived,
  };
}

async function insertCandidateBatch(
  execute: ExecuteCollectionReceiptRecoveryQuery,
  candidates: InspectedCollectionReceiptRecoveryCandidate[],
): Promise<string[]> {
  if (candidates.length === 0) return [];
  const valuesSql = sql.join(
    candidates.map((candidate) => sql`(
      ${randomUUID()}::uuid,
      ${candidate.collectionRecordId}::uuid,
      ${candidate.storagePath},
      ${candidate.originalFileName},
      ${candidate.originalMimeType},
      ${candidate.originalExtension},
      ${candidate.fileSize},
      ${candidate.receiptAmount},
      ${candidate.extractedAmount},
      ${candidate.extractionStatus},
      ${candidate.extractionConfidence},
      ${candidate.receiptDate},
      ${candidate.receiptReference},
      ${candidate.fileHash},
      ${candidate.createdAt}
    )`),
    sql`, `,
  );
  const result = await execute(sql`
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
    ON CONFLICT DO NOTHING
    RETURNING collection_record_id::text as "recordId"
  `);

  return readRows<InsertedReceiptRow>(result)
    .map((row) => normalizeRowText(row.recordId).toLowerCase())
    .filter(Boolean);
}

async function refreshRecoveredRecordCaches(
  execute: ExecuteCollectionReceiptRecoveryQuery,
  recordIds: string[],
): Promise<number> {
  const uniqueRecordIds = Array.from(new Set(recordIds));
  if (uniqueRecordIds.length === 0) return 0;
  const recordIdSql = sql.join(uniqueRecordIds.map((recordId) => sql`${recordId}::uuid`), sql`, `);
  const result = await execute(sql`
    WITH active_receipts AS (
      SELECT
        collection_record_id,
        storage_path,
        created_at,
        id
      FROM public.collection_record_receipts
      WHERE deleted_at IS NULL
        AND collection_record_id IN (${recordIdSql})
    ),
    receipt_counts AS (
      SELECT collection_record_id, count(*)::integer AS receipt_count
      FROM active_receipts
      GROUP BY collection_record_id
    ),
    first_receipts AS (
      SELECT DISTINCT ON (collection_record_id)
        collection_record_id,
        storage_path
      FROM active_receipts
      ORDER BY collection_record_id, created_at ASC, id ASC
    )
    UPDATE public.collection_records record
    SET
      receipt_file = first_receipt.storage_path,
      receipt_count = receipt_count.receipt_count
    FROM first_receipts first_receipt
    JOIN receipt_counts receipt_count
      ON receipt_count.collection_record_id = first_receipt.collection_record_id
    WHERE record.id = first_receipt.collection_record_id
    RETURNING record.id
  `);
  return readRows(result).length;
}

async function writeReceiptRecoveryAuditLog(
  execute: ExecuteCollectionReceiptRecoveryQuery,
  backupId: string,
  stats: CollectionReceiptRecoveryDatabaseStats,
): Promise<void> {
  await execute(sql`
    INSERT INTO public.audit_logs (
      id,
      action,
      performed_by,
      target_resource,
      details,
      timestamp
    )
    VALUES (
      ${randomUUID()},
      'RECOVER_COLLECTION_RECEIPT_METADATA',
      'system:receipt-recovery',
      ${backupId},
      ${JSON.stringify({
        inserted: stats.inserted,
        conflictSkipped: stats.conflictSkipped,
        recordsRefreshed: stats.recordsRefreshed,
        missingCollectionRecords: stats.missingCollectionRecords,
        alreadyActive: stats.alreadyActive,
        alreadyArchived: stats.alreadyArchived,
      })},
      now()
    )
  `);
}

export async function acquireCollectionReceiptRecoveryLock(
  execute: ExecuteCollectionReceiptRecoveryQuery,
): Promise<void> {
  await execute(sql`SELECT pg_advisory_xact_lock(hashtext(${RECEIPT_RECOVERY_LOCK_KEY}))`);
}

export async function recoverCollectionReceiptMetadataInDatabase(params: {
  execute: ExecuteCollectionReceiptRecoveryQuery;
  candidates: InspectedCollectionReceiptRecoveryCandidate[];
  backupId: string;
  apply: boolean;
}): Promise<CollectionReceiptRecoveryDatabaseStats> {
  const stats: CollectionReceiptRecoveryDatabaseStats = {
    inspectedCandidates: params.candidates.length,
    missingCollectionRecords: 0,
    alreadyActive: 0,
    alreadyArchived: 0,
    recoverable: 0,
    inserted: 0,
    conflictSkipped: 0,
    recordsRefreshed: 0,
  };
  const insertedRecordIds: string[] = [];

  for (const candidateBatch of chunkValues(params.candidates, RECOVERY_BATCH_SIZE)) {
    const classified = await classifyCandidateBatch(params.execute, candidateBatch);
    stats.missingCollectionRecords += classified.missingCollectionRecords;
    stats.alreadyActive += classified.alreadyActive;
    stats.alreadyArchived += classified.alreadyArchived;
    stats.recoverable += classified.recoverable.length;
    if (!params.apply) continue;

    const inserted = await insertCandidateBatch(params.execute, classified.recoverable);
    stats.inserted += inserted.length;
    stats.conflictSkipped += classified.recoverable.length - inserted.length;
    insertedRecordIds.push(...inserted);
  }

  if (params.apply && stats.inserted > 0) {
    stats.recordsRefreshed = await refreshRecoveredRecordCaches(params.execute, insertedRecordIds);
    await writeReceiptRecoveryAuditLog(params.execute, params.backupId, stats);
  }

  return stats;
}
