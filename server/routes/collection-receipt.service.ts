import fs from "fs";
import path from "path";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { detectCollectionReceiptSignature } from "../lib/collection-receipt-security";
import { logger } from "../lib/logger";
import type {
  CollectionRecordReceipt,
  PostgresStorage,
} from "../storage-postgres";
import { canUserAccessCollectionRecord } from "./collection-access";
import {
  isCollectionReceiptInlinePreviewMimeType,
  logCollectionReceiptBestEffortFailure,
  normalizeCollectionReceiptMimeType,
  resolveCollectionReceiptFile,
  sanitizeReceiptDownloadName,
} from "./collection-receipt-file-utils";
import { normalizeCollectionText } from "./collection.validation";
export {
  removeCollectionReceiptFile,
  saveCollectionReceipt,
  saveMultipartCollectionReceipt,
} from "./collection-receipt-file-utils";
export type {
  CollectionReceiptInspectionResult,
  MultipartCollectionReceiptInput,
  StoredCollectionReceiptFile,
} from "./collection-receipt-file-utils";

export { detectCollectionReceiptSignature } from "../lib/collection-receipt-security";

function logCollectionReceiptWarning(
  req: AuthenticatedRequest,
  mode: "view" | "download",
  statusCode: number,
  reason: string,
  meta?: Record<string, unknown>,
) {
  logger.warn("Collection receipt request failed", {
    mode,
    statusCode,
    reason,
    username: req.user?.username || null,
    recordId: req.params.id || null,
    receiptId: req.params.receiptId || null,
    ...meta,
  });
}

async function resolveSelectedReceipt(
  storage: PostgresStorage,
  record: {
    id: string;
    receiptFile?: string | null;
    receipts?: CollectionRecordReceipt[] | null;
    createdAt?: Date | string | null;
  },
  receiptIdRaw?: string | null,
): Promise<CollectionRecordReceipt | null> {
  const recordId = normalizeCollectionText(record.id);
  if (!recordId) return null;
  const receiptId = normalizeCollectionText(receiptIdRaw);
  const hydratedReceipts = Array.isArray(record.receipts) ? record.receipts : [];

  if (receiptId) {
    const hydratedMatch = hydratedReceipts.find((receipt) => normalizeCollectionText(receipt.id) === receiptId);
    if (hydratedMatch) {
      return hydratedMatch;
    }
    return (await storage.getCollectionRecordReceiptById(recordId, receiptId)) || null;
  }

  if (hydratedReceipts[0]) {
    return hydratedReceipts[0];
  }

  const receipts = await storage.listCollectionRecordReceipts(recordId);
  if (receipts[0]) {
    return receipts[0];
  }

  // Transitional compatibility bridge:
  // promote legacy collection_records.receipt_file into collection_record_receipts when possible.
  const legacyPath = normalizeCollectionText(record.receiptFile);
  if (!legacyPath) {
    return null;
  }

  const resolvedLegacyFile = resolveCollectionReceiptFile(legacyPath);
  if (!resolvedLegacyFile) {
    return null;
  }

  const compatibilityCreatedAt =
    record.createdAt instanceof Date
      ? record.createdAt
      : record.createdAt
        ? new Date(record.createdAt)
        : new Date();
  const safeCreatedAt = Number.isFinite(compatibilityCreatedAt.getTime())
    ? compatibilityCreatedAt
    : new Date();
  const fallbackFileName = path.basename(resolvedLegacyFile.storedFileName) || "receipt";
  const fallbackExtension = path.extname(fallbackFileName).toLowerCase() || "";
  let fallbackFileSize = 0;
  try {
    const stats = await fs.promises.stat(resolvedLegacyFile.absolutePath);
    fallbackFileSize = Number.isFinite(stats.size) ? stats.size : 0;
  } catch (error) {
    logCollectionReceiptBestEffortFailure("Failed to stat legacy collection receipt during compatibility fallback", {
      recordId,
      legacyPath,
      absolutePath: resolvedLegacyFile.absolutePath,
      error,
    });
    fallbackFileSize = 0;
  }

  try {
    await storage.createCollectionRecordReceipts(recordId, [
      {
        storagePath: legacyPath,
        originalFileName: fallbackFileName,
        originalMimeType: resolvedLegacyFile.mimeType,
        originalExtension: fallbackExtension,
        fileSize: fallbackFileSize,
      },
    ]);
    const refreshedReceipts = await storage.listCollectionRecordReceipts(recordId);
    if (refreshedReceipts[0]) {
      return refreshedReceipts[0];
    }
  } catch (error) {
    logCollectionReceiptBestEffortFailure("Failed to auto-promote legacy collection receipt relation", {
      recordId,
      legacyPath,
      originalFileName: fallbackFileName,
      error,
    });
  }

  return {
    id: `legacy-${recordId}`,
    collectionRecordId: recordId,
    storagePath: legacyPath,
    originalFileName: fallbackFileName,
    originalMimeType: resolvedLegacyFile.mimeType,
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

async function pruneMissingRelationReceipt(
  storage: PostgresStorage,
  recordId: string,
  receipt: CollectionRecordReceipt | null,
): Promise<void> {
  const normalizedReceiptId = normalizeCollectionText(receipt?.id);
  if (!normalizedReceiptId || normalizedReceiptId.startsWith("legacy-")) {
    return;
  }

  try {
    await storage.deleteCollectionRecordReceipts(recordId, [normalizedReceiptId]);
  } catch (error) {
    logCollectionReceiptBestEffortFailure("Failed to prune missing collection receipt relation", {
      recordId,
      receiptId: normalizedReceiptId,
      error,
    });
  }
}

export async function serveCollectionReceipt(
  storage: PostgresStorage,
  req: AuthenticatedRequest,
  res: Response,
  mode: "view" | "download",
  receiptIdRaw?: string | null,
) {
  try {
    if (!req.user) {
      logCollectionReceiptWarning(req, mode, 401, "unauthenticated");
      return res.status(401).json({ ok: false, message: "Unauthenticated" });
    }

    const id = normalizeCollectionText(req.params.id);
    if (!id) {
      logCollectionReceiptWarning(req, mode, 400, "missing_collection_id");
      return res.status(400).json({ ok: false, message: "Collection id is required." });
    }

    const record = await storage.getCollectionRecordById(id);
    if (!record) {
      logCollectionReceiptWarning(req, mode, 404, "record_not_found", { recordId: id });
      return res.status(404).json({ ok: false, message: "Collection record not found." });
    }

    const canAccessRecord = await canUserAccessCollectionRecord(storage, req.user, {
      createdByLogin: record.createdByLogin,
      collectionStaffNickname: record.collectionStaffNickname,
    });
    if (!canAccessRecord) {
      logCollectionReceiptWarning(req, mode, 403, "forbidden", { recordId: record.id });
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const requestedReceiptId = normalizeCollectionText(
      receiptIdRaw ?? req.params.receiptId ?? null,
    );
    let selectedReceipt = await resolveSelectedReceipt(
      storage,
      record,
      requestedReceiptId,
    );
    if (requestedReceiptId && !selectedReceipt) {
      logCollectionReceiptWarning(req, mode, 404, "receipt_row_not_found", {
        recordId: record.id,
        requestedReceiptId,
      });
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }
    let resolved = resolveCollectionReceiptFile(selectedReceipt?.storagePath ?? null);
    if (!resolved && selectedReceipt) {
      await pruneMissingRelationReceipt(storage, record.id, selectedReceipt);
      if (!requestedReceiptId) {
        const refreshedRecord = await storage.getCollectionRecordById(record.id);
        const fallbackReceipt = await resolveSelectedReceipt(storage, refreshedRecord || record, null);
        resolved = resolveCollectionReceiptFile(fallbackReceipt?.storagePath ?? null);
        if (resolved) {
          selectedReceipt = fallbackReceipt;
        }
      }
    }

    if (resolved) {
      try {
        await fs.promises.access(resolved.absolutePath, fs.constants.R_OK);
      } catch (error) {
        logCollectionReceiptWarning(req, mode, 404, "receipt_storage_access_failed", {
          recordId: record.id,
          requestedReceiptId,
          absolutePath: resolved.absolutePath,
          errorCode: (error as NodeJS.ErrnoException)?.code || null,
        });
        await pruneMissingRelationReceipt(storage, record.id, selectedReceipt);
        resolved = null;
        if (!requestedReceiptId) {
          const refreshedRecord = await storage.getCollectionRecordById(record.id);
          const fallbackReceipt = await resolveSelectedReceipt(storage, refreshedRecord || record, null);
          const fallbackResolved = resolveCollectionReceiptFile(fallbackReceipt?.storagePath ?? null);
          if (fallbackResolved) {
            resolved = fallbackResolved;
            selectedReceipt = fallbackReceipt;
          }
        }
      }
    }

    if (!resolved) {
      logCollectionReceiptWarning(req, mode, 404, "receipt_storage_missing", {
        recordId: record.id,
        requestedReceiptId,
      });
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }

    const responseMimeType =
      normalizeCollectionReceiptMimeType(selectedReceipt?.originalMimeType || resolved.mimeType)
      || resolved.mimeType;
    if (mode === "view" && !isCollectionReceiptInlinePreviewMimeType(responseMimeType)) {
      logCollectionReceiptWarning(req, mode, 415, "preview_not_supported", {
        recordId: record.id,
        requestedReceiptId,
        mimeType: responseMimeType,
      });
      return res.status(415).json({ ok: false, message: "Preview not available for this file type." });
    }

    const safeFileName = sanitizeReceiptDownloadName(
      selectedReceipt?.originalFileName || resolved.storedFileName,
    );
    res.setHeader("Content-Type", responseMimeType);
    res.setHeader(
      "Content-Disposition",
      `${mode === "download" ? "attachment" : "inline"}; filename="${safeFileName}"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

    return res.sendFile(resolved.absolutePath, (err) => {
      if (!err || res.headersSent) return;
      const sendErr = err as NodeJS.ErrnoException;
      const status = sendErr.code === "ENOENT" ? 404 : 500;
      const message = status === 404 ? "Receipt file not found." : "Failed to serve receipt file.";
      logCollectionReceiptWarning(req, mode, status, status === 404 ? "send_file_missing" : "send_file_failed", {
        recordId: record.id,
        requestedReceiptId,
        errorCode: sendErr.code || null,
      });
      res.status(status).json({ ok: false, message });
    });
  } catch (err: any) {
    logger.error("Collection receipt request crashed", {
      mode,
      username: req.user?.username || null,
      recordId: req.params.id || null,
      receiptId: req.params.receiptId || null,
      error: err,
    });
    return res.status(500).json({ ok: false, message: err?.message || "Failed to load receipt file." });
  }
}
