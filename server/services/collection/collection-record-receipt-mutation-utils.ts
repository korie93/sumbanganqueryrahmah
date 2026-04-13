import {
  ensureLooseObject,
  normalizeCollectionText,
  type CollectionReceiptMetadataPayload,
} from "../../routes/collection.validation";
import type {
  CollectionRecordReceipt,
  CreateCollectionRecordReceiptInput,
  UpdateCollectionRecordReceiptInput,
} from "../../storage-postgres";
import { normalizeCollectionReceiptExtractionState } from "../../lib/collection-receipt-extraction-state";
import {
  normalizeCollectionReceiptDate,
  normalizeCollectionReceiptExtractionStatus,
  normalizeCollectionReceiptReference,
  parseCollectionAmountToCents,
  type CollectionReceiptValidationDraft,
} from "./collection-receipt-validation";

export type MultipartCollectionPayload = Record<string, unknown> & {
  uploadedReceipts?: unknown[] | null;
};

export function normalizeExtractionConfidence(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  if (parsed <= 1) {
    return parsed;
  }
  if (parsed <= 100) {
    return parsed / 100;
  }
  return null;
}

export function readUploadedReceiptRows(
  body: MultipartCollectionPayload,
): CreateCollectionRecordReceiptInput[] {
  if (!Array.isArray(body.uploadedReceipts)) {
    return [];
  }

  return body.uploadedReceipts
    .map((item) => ensureLooseObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const normalizedReceiptState = normalizeCollectionReceiptExtractionState({
        receiptAmountCents: parseCollectionAmountToCents(item.receiptAmountCents, {
          allowZero: true,
        }),
        extractedAmountCents: parseCollectionAmountToCents(item.extractedAmountCents, {
          allowZero: true,
        }),
        extractionStatus: item.extractionStatus ?? null,
      });
      return {
        storagePath: normalizeCollectionText(item.storagePath),
        originalFileName: normalizeCollectionText(item.originalFileName),
        originalMimeType:
          normalizeCollectionText(item.originalMimeType) || "application/octet-stream",
        originalExtension: normalizeCollectionText(item.originalExtension),
        fileSize: Number(item.fileSize || 0),
        receiptAmountCents: normalizedReceiptState.receiptAmountCents,
        extractedAmountCents: normalizedReceiptState.extractedAmountCents,
        extractionStatus: normalizedReceiptState.extractionStatus,
        extractionConfidence: normalizeExtractionConfidence(item.extractionConfidence),
        receiptDate: normalizeCollectionReceiptDate(item.receiptDate),
        receiptReference: normalizeCollectionReceiptReference(item.receiptReference),
        fileHash: normalizeCollectionText(item.fileHash).toLowerCase() || null,
      };
    })
    .filter((item) => item.storagePath && item.originalFileName && Number.isFinite(item.fileSize));
}

export type NormalizedCollectionReceiptMetadata = {
  receiptId: string | null;
  receiptAmountCents: number | null;
  extractedAmountCents: number | null;
  extractionStatus: CreateCollectionRecordReceiptInput["extractionStatus"];
  extractionConfidence: number | null;
  receiptDate: string | null;
  receiptReference: string | null;
  fileHash: string | null;
};

export function readCollectionReceiptMetadataList(
  raw: unknown,
): CollectionReceiptMetadataPayload[] {
  if (!raw) {
    return [];
  }

  if (typeof raw === "string") {
    const normalized = raw.trim();
    if (!normalized) {
      return [];
    }
    try {
      const parsed = JSON.parse(normalized);
      return Array.isArray(parsed)
        ? parsed
            .map((item) => ensureLooseObject(item))
            .filter((item): item is Record<string, unknown> => Boolean(item))
        : [];
    } catch {
      throw new Error("COLLECTION_RECEIPT_METADATA_INVALID");
    }
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => ensureLooseObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

export function normalizeCollectionReceiptMetadata(
  raw: CollectionReceiptMetadataPayload,
): NormalizedCollectionReceiptMetadata {
  const normalizedReceiptState = normalizeCollectionReceiptExtractionState({
    receiptAmountCents: parseCollectionAmountToCents(raw.receiptAmount, { allowZero: true }),
    extractedAmountCents: parseCollectionAmountToCents(raw.extractedAmount, {
      allowZero: true,
    }),
    extractionStatus: raw.extractionStatus ?? null,
  });
  return {
    receiptId: normalizeCollectionText(raw.receiptId) || null,
    receiptAmountCents: normalizedReceiptState.receiptAmountCents,
    extractedAmountCents: normalizedReceiptState.extractedAmountCents,
    extractionStatus: normalizedReceiptState.extractionStatus,
    extractionConfidence: normalizeExtractionConfidence(raw.extractionConfidence),
    receiptDate: normalizeCollectionReceiptDate(raw.receiptDate),
    receiptReference: normalizeCollectionReceiptReference(raw.receiptReference),
    fileHash: normalizeCollectionText(raw.fileHash).toLowerCase() || null,
  };
}

export function buildValidationDraftFromExistingReceipt(
  receipt: CollectionRecordReceipt,
): CollectionReceiptValidationDraft {
  return {
    receiptId: receipt.id,
    fileHash: normalizeCollectionText(receipt.fileHash).toLowerCase() || null,
    originalFileName: receipt.originalFileName,
    receiptAmountCents: parseCollectionAmountToCents(receipt.receiptAmount, {
      allowZero: true,
    }),
    extractedAmountCents: parseCollectionAmountToCents(receipt.extractedAmount, {
      allowZero: true,
    }),
    extractionStatus: normalizeCollectionReceiptExtractionStatus(receipt.extractionStatus),
    extractionConfidence:
      receipt.extractionConfidence === null || receipt.extractionConfidence === undefined
        ? null
        : Number(receipt.extractionConfidence),
    receiptDate: normalizeCollectionReceiptDate(receipt.receiptDate),
    receiptReference: normalizeCollectionReceiptReference(receipt.receiptReference),
  };
}

export function buildValidationDraftFromMetadata(params: {
  metadata: NormalizedCollectionReceiptMetadata;
  originalFileName?: string | null;
}): CollectionReceiptValidationDraft {
  return {
    receiptId: params.metadata.receiptId,
    fileHash: params.metadata.fileHash,
    originalFileName: params.originalFileName || null,
    receiptAmountCents: params.metadata.receiptAmountCents,
    extractedAmountCents: params.metadata.extractedAmountCents,
    extractionStatus: params.metadata.extractionStatus,
    extractionConfidence: params.metadata.extractionConfidence,
    receiptDate: params.metadata.receiptDate,
    receiptReference: params.metadata.receiptReference,
  };
}

export function buildCreateReceiptInput(
  uploadedReceipt: CreateCollectionRecordReceiptInput,
  metadata: NormalizedCollectionReceiptMetadata,
): CreateCollectionRecordReceiptInput {
  const normalizedReceiptState = normalizeCollectionReceiptExtractionState({
    receiptAmountCents: metadata.receiptAmountCents,
    extractedAmountCents: metadata.extractedAmountCents,
    extractionStatus:
      metadata.extractionStatus
      || normalizeCollectionReceiptExtractionStatus(uploadedReceipt.extractionStatus),
  });
  return {
    ...uploadedReceipt,
    receiptAmountCents: normalizedReceiptState.receiptAmountCents,
    extractedAmountCents: normalizedReceiptState.extractedAmountCents,
    extractionStatus: normalizedReceiptState.extractionStatus,
    extractionConfidence: metadata.extractionConfidence,
    receiptDate: metadata.receiptDate,
    receiptReference: metadata.receiptReference,
    fileHash:
      metadata.fileHash || normalizeCollectionText(uploadedReceipt.fileHash).toLowerCase() || null,
  };
}

export function buildReceiptUpdateInput(
  receiptId: string,
  draft: CollectionReceiptValidationDraft,
): UpdateCollectionRecordReceiptInput {
  const normalizedReceiptState = normalizeCollectionReceiptExtractionState({
    receiptAmountCents: draft.receiptAmountCents ?? null,
    extractedAmountCents: draft.extractedAmountCents ?? null,
    extractionStatus: draft.extractionStatus ?? null,
  });
  return {
    receiptId,
    receiptAmountCents: normalizedReceiptState.receiptAmountCents,
    extractedAmountCents: normalizedReceiptState.extractedAmountCents,
    extractionStatus: normalizedReceiptState.extractionStatus,
    extractionConfidence: draft.extractionConfidence ?? null,
    receiptDate: draft.receiptDate ?? null,
    receiptReference: draft.receiptReference ?? null,
  };
}
