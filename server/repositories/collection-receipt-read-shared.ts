import path from "path";
import type { CollectionRepositoryQueryResult } from "./collection-nickname-utils";
import {
  formatCollectionAmountFromCents,
  normalizeCollectionReceiptExtractionStatus,
} from "../services/collection/collection-receipt-validation";
import type { CollectionRecordReceipt } from "../storage-postgres";

export type CollectionRecordReceiptDbRow = {
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

export function normalizeUniqueValues(values: string[]): string[] {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

export function normalizeCollectionDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date();
}

export function inferLegacyReceiptMimeType(storagePath: string): string {
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
