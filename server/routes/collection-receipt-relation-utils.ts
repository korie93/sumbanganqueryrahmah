import fs from "fs";
import path from "path";
import type {
  CollectionRecordReceipt,
  PostgresStorage,
} from "../storage-postgres";
import { normalizeCollectionText } from "./collection.validation";
import {
  logCollectionReceiptBestEffortFailure,
  resolveCollectionReceiptFile,
} from "./collection-receipt-file-utils";

type CollectionReceiptStorageRelationAccess = Pick<
  PostgresStorage,
  | "listCollectionRecordReceipts"
  | "getCollectionRecordReceiptById"
  | "createCollectionRecordReceipts"
  | "deleteCollectionRecordReceipts"
>;

export type CollectionReceiptRecordLike = {
  id: string;
  receiptFile?: string | null;
  receipts?: CollectionRecordReceipt[] | null;
  createdAt?: Date | string | null;
};

async function promoteLegacyCollectionReceiptRelation(params: {
  storage: CollectionReceiptStorageRelationAccess;
  recordId: string;
  record: CollectionReceiptRecordLike;
  legacyPath: string;
  resolvedLegacyFile: {
    absolutePath: string;
    storedFileName: string;
    mimeType: string;
  };
}): Promise<CollectionRecordReceipt | null> {
  const compatibilityCreatedAt =
    params.record.createdAt instanceof Date
      ? params.record.createdAt
      : params.record.createdAt
        ? new Date(params.record.createdAt)
        : new Date();
  const safeCreatedAt = Number.isFinite(compatibilityCreatedAt.getTime())
    ? compatibilityCreatedAt
    : new Date();
  const fallbackFileName = path.basename(params.resolvedLegacyFile.storedFileName) || "receipt";
  const fallbackExtension = path.extname(fallbackFileName).toLowerCase() || "";
  let fallbackFileSize = 0;

  try {
    const stats = await fs.promises.stat(params.resolvedLegacyFile.absolutePath);
    fallbackFileSize = Number.isFinite(stats.size) ? stats.size : 0;
  } catch (error) {
    logCollectionReceiptBestEffortFailure("Failed to stat legacy collection receipt during compatibility fallback", {
      recordId: params.recordId,
      legacyPath: params.legacyPath,
      absolutePath: params.resolvedLegacyFile.absolutePath,
      error,
    });
  }

  try {
    await params.storage.createCollectionRecordReceipts(params.recordId, [
      {
        storagePath: params.legacyPath,
        originalFileName: fallbackFileName,
        originalMimeType: params.resolvedLegacyFile.mimeType,
        originalExtension: fallbackExtension,
        fileSize: fallbackFileSize,
      },
    ]);

    const refreshedReceipts = await params.storage.listCollectionRecordReceipts(params.recordId);
    if (refreshedReceipts[0]) {
      return refreshedReceipts[0];
    }
  } catch (error) {
    logCollectionReceiptBestEffortFailure("Failed to auto-promote legacy collection receipt relation", {
      recordId: params.recordId,
      legacyPath: params.legacyPath,
      originalFileName: fallbackFileName,
      error,
    });
  }

  return {
    id: `legacy-${params.recordId}`,
    collectionRecordId: params.recordId,
    storagePath: params.legacyPath,
    originalFileName: fallbackFileName,
    originalMimeType: params.resolvedLegacyFile.mimeType,
    originalExtension: fallbackExtension,
    fileSize: fallbackFileSize,
    receiptAmount: null,
    extractedAmount: null,
    extractionStatus: "unprocessed",
    extractionConfidence: null,
    receiptDate: null,
    receiptReference: null,
    fileHash: null,
    createdAt: safeCreatedAt,
  };
}

export async function resolveSelectedCollectionReceipt(params: {
  storage: CollectionReceiptStorageRelationAccess;
  record: CollectionReceiptRecordLike;
  receiptIdRaw?: string | null;
}): Promise<CollectionRecordReceipt | null> {
  const recordId = normalizeCollectionText(params.record.id);
  if (!recordId) {
    return null;
  }

  const receiptId = normalizeCollectionText(params.receiptIdRaw);
  const hydratedReceipts = Array.isArray(params.record.receipts) ? params.record.receipts : [];

  if (receiptId) {
    const hydratedMatch = hydratedReceipts.find(
      (receipt) => normalizeCollectionText(receipt.id) === receiptId,
    );
    if (hydratedMatch) {
      return hydratedMatch;
    }

    return (await params.storage.getCollectionRecordReceiptById(recordId, receiptId)) || null;
  }

  if (hydratedReceipts[0]) {
    return hydratedReceipts[0];
  }

  const receipts = await params.storage.listCollectionRecordReceipts(recordId);
  if (receipts[0]) {
    return receipts[0];
  }

  const legacyPath = normalizeCollectionText(params.record.receiptFile);
  if (!legacyPath) {
    return null;
  }

  const resolvedLegacyFile = resolveCollectionReceiptFile(legacyPath);
  if (!resolvedLegacyFile) {
    return null;
  }

  return promoteLegacyCollectionReceiptRelation({
    storage: params.storage,
    recordId,
    record: params.record,
    legacyPath,
    resolvedLegacyFile,
  });
}

export async function pruneMissingCollectionReceiptRelation(params: {
  storage: CollectionReceiptStorageRelationAccess;
  recordId: string;
  receipt: CollectionRecordReceipt | null;
}): Promise<void> {
  const normalizedReceiptId = normalizeCollectionText(params.receipt?.id);
  if (!normalizedReceiptId || normalizedReceiptId.startsWith("legacy-")) {
    return;
  }

  try {
    await params.storage.deleteCollectionRecordReceipts(params.recordId, [normalizedReceiptId]);
  } catch (error) {
    logCollectionReceiptBestEffortFailure("Failed to prune missing collection receipt relation", {
      recordId: params.recordId,
      receiptId: normalizedReceiptId,
      error,
    });
  }
}
