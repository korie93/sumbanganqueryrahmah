import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { ERROR_CODES } from "../../shared/error-codes";
import { logger } from "../lib/logger";
import type {
  PostgresStorage,
} from "../storage-postgres";
import {
  isCollectionReceiptInlinePreviewMimeType,
  normalizeCollectionReceiptMimeType,
  sanitizeReceiptDownloadName,
} from "./collection-receipt-file-utils";
import { resolveCollectionReceiptRequestContext } from "./collection-receipt-request-context-utils";
import {
  applyCollectionReceiptResponseHeaders,
  logCollectionReceiptWarning,
} from "./collection-receipt-response-utils";
import { resolveReadableCollectionReceiptTarget } from "./collection-receipt-target-utils";
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

const COLLECTION_RECEIPT_ERROR_CODES = {
  LOAD_FAILED: "COLLECTION_RECEIPT_LOAD_FAILED",
  NOT_FOUND: "COLLECTION_RECEIPT_NOT_FOUND",
  PREVIEW_UNSUPPORTED: "COLLECTION_RECEIPT_PREVIEW_UNSUPPORTED",
} as const;

function buildCollectionReceiptErrorResponse(
  message: string,
  code?: string,
) {
  return {
    ok: false as const,
    message,
    error: {
      ...(code ? { code } : {}),
      message,
    },
  };
}

function resolveCollectionReceiptErrorCode(params: {
  statusCode: number;
  reason: string;
}) {
  const { reason, statusCode } = params;

  if (reason === "missing_collection_id") {
    return ERROR_CODES.REQUEST_BODY_INVALID;
  }

  if (
    reason === "record_not_found"
    || reason === "receipt_row_not_found"
    || reason === "receipt_storage_missing"
    || reason === "send_file_missing"
  ) {
    return COLLECTION_RECEIPT_ERROR_CODES.NOT_FOUND;
  }

  if (reason === "preview_not_supported") {
    return COLLECTION_RECEIPT_ERROR_CODES.PREVIEW_UNSUPPORTED;
  }

  if (statusCode >= 500 || reason === "send_file_failed") {
    return COLLECTION_RECEIPT_ERROR_CODES.LOAD_FAILED;
  }

  return undefined;
}

export async function serveCollectionReceipt(
  storage: PostgresStorage,
  req: AuthenticatedRequest,
  res: Response,
  mode: "view" | "download",
  receiptIdRaw?: string | null,
) {
  try {
    const requestContext = await resolveCollectionReceiptRequestContext(storage, req, receiptIdRaw);
    if (!requestContext.ok) {
      logCollectionReceiptWarning({
        req,
        mode,
        statusCode: requestContext.statusCode,
        reason: requestContext.reason,
        meta: requestContext.meta,
      });
      return res.status(requestContext.statusCode).json(
        buildCollectionReceiptErrorResponse(
          requestContext.message,
          resolveCollectionReceiptErrorCode({
            statusCode: requestContext.statusCode,
            reason: requestContext.reason,
          }),
        ),
      );
    }

    const { record, requestedReceiptId } = requestContext;
    const resolvedTarget = await resolveReadableCollectionReceiptTarget({
      storage,
      req,
      mode,
      record,
      requestedReceiptId,
    });
    if (!resolvedTarget.ok) {
      logCollectionReceiptWarning({
        req,
        mode,
        statusCode: resolvedTarget.statusCode,
        reason: resolvedTarget.reason,
        meta: resolvedTarget.meta,
      });
      return res.status(resolvedTarget.statusCode).json(
        buildCollectionReceiptErrorResponse(
          resolvedTarget.message,
          resolveCollectionReceiptErrorCode({
            statusCode: resolvedTarget.statusCode,
            reason: resolvedTarget.reason,
          }),
        ),
      );
    }

    const { resolved, selectedReceipt } = resolvedTarget;
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
      return res.status(415).json(
        buildCollectionReceiptErrorResponse(
          "Preview not available for this file type.",
          COLLECTION_RECEIPT_ERROR_CODES.PREVIEW_UNSUPPORTED,
        ),
      );
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
      res.status(status).json(
        buildCollectionReceiptErrorResponse(
          message,
          resolveCollectionReceiptErrorCode({
            statusCode: status,
            reason: status === 404 ? "send_file_missing" : "send_file_failed",
          }),
        ),
      );
    });
  } catch (error) {
    logger.error("Collection receipt request crashed", {
      mode,
      username: req.user?.username || null,
      recordId: req.params.id || null,
      receiptId: req.params.receiptId || null,
      error,
    });
    return res.status(500).json(
      buildCollectionReceiptErrorResponse(
        "Failed to load receipt file.",
        COLLECTION_RECEIPT_ERROR_CODES.LOAD_FAILED,
      ),
    );
  }
}
