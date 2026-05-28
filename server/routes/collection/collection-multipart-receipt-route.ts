import path from "node:path";
import Busboy from "busboy";
import type { RequestHandler } from "express";
import { logger } from "../../lib/logger";
import {
  appendCollectionMultipartField,
  isCollectionReceiptMultipartField,
} from "./collection-multipart-body-utils";
import { buildCollectionReceiptSecurityErrorResponse } from "../collection-receipt-error-response";

const MULTIPART_FILENAME_UNSAFE_CHAR_PATTERN = /[^a-zA-Z0-9._()-]+/g;
const DEFAULT_MULTIPART_RECEIPT_UPLOAD_TIMEOUT_MS = 120_000;

class MultipartReceiptUploadTimeoutError extends Error {
  readonly statusCode = 408;

  constructor() {
    super("Receipt upload timed out. Please retry with a stable connection.");
    this.name = "MultipartReceiptUploadTimeoutError";
  }
}

function sanitizeMultipartUploadFilename(rawFileName: string): string | null {
  const baseName = path.posix.basename(String(rawFileName || "").replace(/\\/g, "/")).trim();
  if (!baseName) {
    return null;
  }

  const sanitized = baseName
    .replace(MULTIPART_FILENAME_UNSAFE_CHAR_PATTERN, "_")
    .replace(/^\.+/, "")
    .replace(/_+/g, "_")
    .slice(0, 255)
    .trim();

  return sanitized || null;
}

export function createCollectionReceiptMultipartRoute<
  TReceipt,
  TBody extends Record<string, unknown>,
>(params: {
  attachKey: keyof TBody;
  authorizeRequest?: ((req: Parameters<RequestHandler>[0]) => Promise<void>) | undefined;
  handleReceipt: (input: {
    fileName?: string | null;
    mimeType?: string | null;
    stream: NodeJS.ReadableStream;
  }) => Promise<TReceipt>;
  cleanupReceipts?: (receipts: TReceipt[]) => Promise<void>;
  uploadTimeoutMs?: number;
}): RequestHandler {
  return (req, res, next) => {
    if (!req.is("multipart/form-data")) {
      next();
      return;
    }

    const startMultipartParsing = () => {
    const parser = Busboy({
      headers: req.headers,
      limits: {
        files: 8,
        fields: 40,
      },
    });

    const body = {} as TBody;
    const completedReceipts: TReceipt[] = [];
    const uploadTasks: Array<Promise<TReceipt>> = [];
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const clearUploadTimeout = () => {
      if (!timeoutHandle) {
        return;
      }
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    };

    const fail = async (error: unknown, options: { waitForUploads?: boolean } = {}) => {
      if (settled) {
        return;
      }
      settled = true;
      clearUploadTimeout();

      if (params.cleanupReceipts) {
        try {
          if (options.waitForUploads !== false) {
            await Promise.allSettled(uploadTasks);
          }
          await params.cleanupReceipts([...completedReceipts]);
        } catch (cleanupError) {
          logger.error("Multipart cleanup failed", {
            cleanupError,
            originalError: error,
          });
        }
      }

      const receiptSecurityResponse = buildCollectionReceiptSecurityErrorResponse(error);
      if (receiptSecurityResponse) {
        logger.warn("Multipart collection receipt security check failed", {
          reasonCode: receiptSecurityResponse.body.error.code,
        });
        res.status(receiptSecurityResponse.statusCode).json(receiptSecurityResponse.body);
        return;
      }

      if (error instanceof MultipartReceiptUploadTimeoutError) {
        res.status(error.statusCode).json({
          ok: false,
          message: error.message,
        });
        return;
      }

      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to parse multipart collection payload.";
      res.status(400).json({
        ok: false,
        message,
      });
    };

    parser.on("field", (fieldName, value) => {
      appendCollectionMultipartField(body, fieldName, value);
    });

    parser.on("file", (fieldName, file, info) => {
      if (!info.filename || !isCollectionReceiptMultipartField(fieldName)) {
        file.resume();
        return;
      }

      const safeFileName = sanitizeMultipartUploadFilename(info.filename);
      if (!safeFileName) {
        file.resume();
        return;
      }

      const uploadTask = params.handleReceipt({
          fileName: safeFileName,
          mimeType: info.mimeType,
          stream: file,
        })
        .then((receipt) => {
          completedReceipts.push(receipt);
          return receipt;
        });
      uploadTasks.push(uploadTask);
      void uploadTask.catch(() => undefined);
    });

    parser.once("error", (error) => {
      fail(error).catch((cleanupError) => {
        logger.error("Multipart cleanup failed after parser error", {
          cleanupError,
          originalError: error,
        });
      });
    });

    req.once("error", (error) => {
      fail(error).catch((cleanupError) => {
        logger.error("Multipart cleanup failed after request error", {
          cleanupError,
          originalError: error,
        });
      });
    });

    parser.once("finish", async () => {
      if (settled) {
        return;
      }

      try {
        body[params.attachKey] = await Promise.all(uploadTasks) as TBody[keyof TBody];
        settled = true;
        clearUploadTimeout();
        req.body = body;
        next();
      } catch (error) {
        await fail(error);
      }
    });

    const uploadTimeoutMs = Math.max(
      1,
      Math.trunc(Number(params.uploadTimeoutMs || DEFAULT_MULTIPART_RECEIPT_UPLOAD_TIMEOUT_MS)),
    );
    timeoutHandle = setTimeout(() => {
      const timeoutError = new MultipartReceiptUploadTimeoutError();
      req.unpipe(parser);
      parser.destroy(timeoutError);
      req.resume();
      void fail(timeoutError, { waitForUploads: false });
    }, uploadTimeoutMs);
    timeoutHandle.unref?.();

    req.pipe(parser);
    };

    if (!params.authorizeRequest) {
      startMultipartParsing();
      return;
    }

    params.authorizeRequest(req)
      .then(startMultipartParsing)
      .catch(next);
  };
}
