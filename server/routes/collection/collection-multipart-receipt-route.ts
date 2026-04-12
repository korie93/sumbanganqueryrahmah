import path from "node:path";
import Busboy from "busboy";
import type { RequestHandler } from "express";
import { logger } from "../../lib/logger";
import {
  appendCollectionMultipartField,
  isCollectionReceiptMultipartField,
} from "./collection-multipart-body-utils";

const MULTIPART_FILENAME_UNSAFE_CHAR_PATTERN = /[^a-zA-Z0-9._()-]+/g;

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
  handleReceipt: (input: {
    fileName?: string | null;
    mimeType?: string | null;
    stream: NodeJS.ReadableStream;
  }) => Promise<TReceipt>;
  cleanupReceipts?: (receipts: TReceipt[]) => Promise<void>;
}): RequestHandler {
  return (req, res, next) => {
    if (!req.is("multipart/form-data")) {
      next();
      return;
    }

    const parser = Busboy({
      headers: req.headers,
      limits: {
        files: 8,
        fields: 40,
      },
    });

    const body = {} as TBody;
    const uploadTasks: Array<Promise<TReceipt>> = [];
    let settled = false;

    const fail = async (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;

      if (params.cleanupReceipts) {
        try {
          const completedUploads = await Promise.allSettled(uploadTasks);
          const completedReceipts: TReceipt[] = [];
          for (const result of completedUploads) {
            if (result.status === "fulfilled") {
              completedReceipts.push(result.value);
            }
          }
          await params.cleanupReceipts(completedReceipts);
        } catch (cleanupError) {
          logger.error("Multipart cleanup failed", {
            cleanupError,
            originalError: error,
          });
        }
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

      uploadTasks.push(
        params.handleReceipt({
          fileName: safeFileName,
          mimeType: info.mimeType,
          stream: file,
        }),
      );
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
        req.body = body;
        next();
      } catch (error) {
        await fail(error);
      }
    });

    req.pipe(parser);
  };
}
