import fs from "fs";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
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
import {
  applyCollectionReceiptResponseHeaders,
  logCollectionReceiptWarning,
} from "./collection-receipt-response-utils";
import {
  pruneMissingCollectionReceiptRelation,
  resolveSelectedCollectionReceipt,
} from "./collection-receipt-relation-utils";
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

export async function serveCollectionReceipt(
  storage: PostgresStorage,
  req: AuthenticatedRequest,
  res: Response,
  mode: "view" | "download",
  receiptIdRaw?: string | null,
) {
  try {
    if (!req.user) {
      logCollectionReceiptWarning({ req, mode, statusCode: 401, reason: "unauthenticated" });
      return res.status(401).json({ ok: false, message: "Unauthenticated" });
    }

    const id = normalizeCollectionText(req.params.id);
    if (!id) {
      logCollectionReceiptWarning({ req, mode, statusCode: 400, reason: "missing_collection_id" });
      return res.status(400).json({ ok: false, message: "Collection id is required." });
    }

    const record = await storage.getCollectionRecordById(id);
    if (!record) {
      logCollectionReceiptWarning({
        req,
        mode,
        statusCode: 404,
        reason: "record_not_found",
        meta: { recordId: id },
      });
      return res.status(404).json({ ok: false, message: "Collection record not found." });
    }

    const canAccessRecord = await canUserAccessCollectionRecord(storage, req.user, {
      createdByLogin: record.createdByLogin,
      collectionStaffNickname: record.collectionStaffNickname,
    });
    if (!canAccessRecord) {
      logCollectionReceiptWarning({
        req,
        mode,
        statusCode: 403,
        reason: "forbidden",
        meta: { recordId: record.id },
      });
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const requestedReceiptId = normalizeCollectionText(
      receiptIdRaw ?? req.params.receiptId ?? null,
    );
    let selectedReceipt = await resolveSelectedCollectionReceipt({
      storage,
      record,
      receiptIdRaw: requestedReceiptId,
    });
    if (requestedReceiptId && !selectedReceipt) {
      logCollectionReceiptWarning({
        req,
        mode,
        statusCode: 404,
        reason: "receipt_row_not_found",
        meta: {
          recordId: record.id,
          requestedReceiptId,
        },
      });
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }
    let resolved = resolveCollectionReceiptFile(selectedReceipt?.storagePath ?? null);
    if (!resolved && selectedReceipt) {
      await pruneMissingCollectionReceiptRelation({
        storage,
        recordId: record.id,
        receipt: selectedReceipt,
      });
      if (!requestedReceiptId) {
        const refreshedRecord = await storage.getCollectionRecordById(record.id);
        const fallbackReceipt = await resolveSelectedCollectionReceipt({
          storage,
          record: refreshedRecord || record,
          receiptIdRaw: null,
        });
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
        logCollectionReceiptWarning({
          req,
          mode,
          statusCode: 404,
          reason: "receipt_storage_access_failed",
          meta: {
            recordId: record.id,
            requestedReceiptId,
            absolutePath: resolved.absolutePath,
            errorCode: (error as NodeJS.ErrnoException)?.code || null,
          },
        });
        await pruneMissingCollectionReceiptRelation({
          storage,
          recordId: record.id,
          receipt: selectedReceipt,
        });
        resolved = null;
        if (!requestedReceiptId) {
          const refreshedRecord = await storage.getCollectionRecordById(record.id);
          const fallbackReceipt = await resolveSelectedCollectionReceipt({
            storage,
            record: refreshedRecord || record,
            receiptIdRaw: null,
          });
          const fallbackResolved = resolveCollectionReceiptFile(fallbackReceipt?.storagePath ?? null);
          if (fallbackResolved) {
            resolved = fallbackResolved;
            selectedReceipt = fallbackReceipt;
          }
        }
      }
    }

    if (!resolved) {
      logCollectionReceiptWarning({
        req,
        mode,
        statusCode: 404,
        reason: "receipt_storage_missing",
        meta: {
          recordId: record.id,
          requestedReceiptId,
        },
      });
      return res.status(404).json({ ok: false, message: "Receipt file not found." });
    }

    const responseMimeType =
      normalizeCollectionReceiptMimeType(selectedReceipt?.originalMimeType || resolved.mimeType)
      || resolved.mimeType;
    if (mode === "view" && !isCollectionReceiptInlinePreviewMimeType(responseMimeType)) {
      logCollectionReceiptWarning({
        req,
        mode,
        statusCode: 415,
        reason: "preview_not_supported",
        meta: {
          recordId: record.id,
          requestedReceiptId,
          mimeType: responseMimeType,
        },
      });
      return res.status(415).json({ ok: false, message: "Preview not available for this file type." });
    }

    const safeFileName = sanitizeReceiptDownloadName(
      selectedReceipt?.originalFileName || resolved.storedFileName,
    );
    applyCollectionReceiptResponseHeaders({
      res,
      mode,
      mimeType: responseMimeType,
      safeFileName,
    });

    return res.sendFile(resolved.absolutePath, (err) => {
      if (!err || res.headersSent) return;
      const sendErr = err as NodeJS.ErrnoException;
      const status = sendErr.code === "ENOENT" ? 404 : 500;
      const message = status === 404 ? "Receipt file not found." : "Failed to serve receipt file.";
      logCollectionReceiptWarning({
        req,
        mode,
        statusCode: status,
        reason: status === 404 ? "send_file_missing" : "send_file_failed",
        meta: {
          recordId: record.id,
          requestedReceiptId,
          errorCode: sendErr.code || null,
        },
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
