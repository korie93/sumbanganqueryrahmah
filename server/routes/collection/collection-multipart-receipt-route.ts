import path from "node:path";
import Busboy from "busboy";
import type { RequestHandler } from "express";
import { logger } from "../../lib/logger";
import { CollectionReceiptSecurityError } from "../../lib/collection-receipt-security";
import {
  appendCollectionMultipartField,
  isCollectionReceiptMultipartField,
} from "./collection-multipart-body-utils";
import { buildCollectionReceiptSecurityErrorResponse } from "../collection-receipt-error-response";
import {
  COLLECTION_RECEIPT_ALLOWED_MIME,
  COLLECTION_RECEIPT_MAX_BYTES,
  normalizeCollectionReceiptMimeType,
} from "../collection-receipt-file-type-utils";

const MULTIPART_FILENAME_UNSAFE_CHAR_PATTERN = /[^a-zA-Z0-9._()-]+/g;
const DEFAULT_MULTIPART_RECEIPT_UPLOAD_TIMEOUT_MS = 120_000;
const DEFAULT_MULTIPART_RECEIPT_MAX_FILES = 8;

type MultipartReceiptFileStream = NodeJS.ReadableStream & {
  destroy?: (error?: Error) => void;
  resume?: () => void;
  unpipe?: (destination?: NodeJS.WritableStream | undefined) => unknown;
};

function toMultipartReceiptError(error: unknown): Error | undefined {
  if (error instanceof Error) {
    return error;
  }

  return error == null ? undefined : new Error(String(error));
}

class MultipartReceiptUploadTimeoutError extends Error {
  readonly statusCode = 408;

  constructor() {
    super("Receipt upload timed out. Please retry with a stable connection.");
    this.name = "MultipartReceiptUploadTimeoutError";
  }
}

class MultipartReceiptUploadLimitError extends Error {
  readonly statusCode = 413;

  constructor(message: string) {
    super(message);
    this.name = "MultipartReceiptUploadLimitError";
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
        files: DEFAULT_MULTIPART_RECEIPT_MAX_FILES,
        fields: 40,
        fileSize: COLLECTION_RECEIPT_MAX_BYTES,
        parts: DEFAULT_MULTIPART_RECEIPT_MAX_FILES + 40,
      },
    });

    const body = {} as TBody;
    const completedReceipts: TReceipt[] = [];
    const uploadTasks: Array<Promise<TReceipt>> = [];
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const activeFileStreams = new Set<MultipartReceiptFileStream>();
    const parserStream = parser as NodeJS.WritableStream & {
      destroy?: (error?: Error) => void;
    };

    const clearUploadTimeout = () => {
      if (!timeoutHandle) {
        return;
      }
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    };

    const cleanupTrackedFileStreams = (error?: unknown) => {
      const cleanupError = toMultipartReceiptError(error);
      for (const stream of activeFileStreams) {
        try {
          stream.unpipe?.();
        } catch (cleanupFailure) {
          logger.warn("Multipart receipt stream unpipe failed", {
            error: toMultipartReceiptError(cleanupFailure)?.message ?? "Unknown cleanup failure",
          });
        }

        try {
          stream.resume?.();
        } catch (cleanupFailure) {
          logger.warn("Multipart receipt stream resume failed", {
            error: toMultipartReceiptError(cleanupFailure)?.message ?? "Unknown cleanup failure",
          });
        }

        try {
          stream.destroy?.(cleanupError);
        } catch (cleanupFailure) {
          logger.warn("Multipart receipt stream destroy failed", {
            error: toMultipartReceiptError(cleanupFailure)?.message ?? "Unknown cleanup failure",
          });
        }
      }
      activeFileStreams.clear();
    };

    const stopMultipartParsing = (error?: unknown) => {
      const cleanupError = toMultipartReceiptError(error);
      try {
        req.unpipe(parser);
      } catch (cleanupFailure) {
        logger.warn("Multipart receipt request unpipe failed", {
          error: toMultipartReceiptError(cleanupFailure)?.message ?? "Unknown cleanup failure",
        });
      }

      try {
        parserStream.destroy?.(cleanupError);
      } catch (cleanupFailure) {
        logger.warn("Multipart receipt parser destroy failed", {
          error: toMultipartReceiptError(cleanupFailure)?.message ?? "Unknown cleanup failure",
        });
      }

      try {
        req.resume();
      } catch (cleanupFailure) {
        logger.warn("Multipart receipt request resume failed", {
          error: toMultipartReceiptError(cleanupFailure)?.message ?? "Unknown cleanup failure",
        });
      }

      cleanupTrackedFileStreams(cleanupError);
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

      if (error instanceof MultipartReceiptUploadTimeoutError || error instanceof MultipartReceiptUploadLimitError) {
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

      const normalizedMimeType = normalizeCollectionReceiptMimeType(info.mimeType || "");
      if (!COLLECTION_RECEIPT_ALLOWED_MIME.has(normalizedMimeType)) {
        const error = new CollectionReceiptSecurityError(
          "Receipt file MIME type is not allowed.",
          "receipt-mime-not-allowed",
        );
        const rejectedFile = file as MultipartReceiptFileStream;
        file.once("error", () => undefined);
        rejectedFile.resume?.();
        stopMultipartParsing(error);
        void fail(error, { waitForUploads: false });
        return;
      }

      activeFileStreams.add(file);
      const unregisterFileStream = () => {
        activeFileStreams.delete(file);
      };
      file.once("close", unregisterFileStream);
      file.once("end", unregisterFileStream);
      file.once("error", unregisterFileStream);
      file.once("limit", () => {
        const error = new MultipartReceiptUploadLimitError("Receipt file exceeds 5MB.");
        stopMultipartParsing(error);
        void fail(error, { waitForUploads: false });
      });

      const uploadTask = params.handleReceipt({
          fileName: safeFileName,
          mimeType: normalizedMimeType,
          stream: file,
        })
        .then((receipt) => {
          completedReceipts.push(receipt);
          return receipt;
        });
      uploadTasks.push(uploadTask);
      void uploadTask.catch(() => undefined);
    });

    parser.once("filesLimit", () => {
      const error = new MultipartReceiptUploadLimitError(
        `Receipt upload accepts at most ${DEFAULT_MULTIPART_RECEIPT_MAX_FILES} files per request.`,
      );
      stopMultipartParsing(error);
      void fail(error, { waitForUploads: false });
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
      stopMultipartParsing(timeoutError);
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
