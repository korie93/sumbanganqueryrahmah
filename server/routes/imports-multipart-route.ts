import Busboy from "busboy";
import type { AuthenticatedRequest } from "../auth/guards";
import type { RequestHandler } from "express";
import { DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES } from "../config/body-limit";
import { logger } from "../lib/logger";
import {
  cleanupPreparedMultipartImportUpload,
  normalizeImportName,
  prepareMultipartImportUpload,
  resolveImportMultipartFailure,
  type PreparedMultipartImportUpload,
  type MultipartImportBody,
} from "./imports-multipart-utils";
import {
  createActiveImportUploadQuotaTracker,
  type ActiveImportUploadQuotaTracker,
} from "./imports-upload-quota";

type MultipartUploadFileStream = {
  destroy?: (error?: Error) => void;
  resume?: () => void;
  unpipe?: (destination?: NodeJS.WritableStream | undefined) => unknown;
};

function toMultipartCleanupError(error: unknown): Error | undefined {
  if (error instanceof Error) {
    return error;
  }

  return error == null ? undefined : new Error(String(error));
}

export function cleanupTrackedMultipartUploadStreamsForTests(
  streams: Iterable<MultipartUploadFileStream>,
  error?: unknown,
): number {
  const cleanupError = toMultipartCleanupError(error);
  let cleaned = 0;

  for (const stream of streams) {
    try {
      stream.unpipe?.();
    } catch {
      // Ignore best-effort cleanup failures while tearing down multipart parsing.
    }

    try {
      stream.resume?.();
    } catch {
      // Ignore best-effort cleanup failures while tearing down multipart parsing.
    }

    try {
      stream.destroy?.(cleanupError);
      cleaned += 1;
    } catch {
      // Ignore best-effort cleanup failures while tearing down multipart parsing.
    }
  }

  return cleaned;
}

export function createImportsMultipartRoute(
  maxFileSizeBytes: number = DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
  perUserQuotaBytes: number = maxFileSizeBytes,
  uploadQuotaTracker?: ActiveImportUploadQuotaTracker,
): RequestHandler {
  const safeMaxFileSizeBytes = Number.isFinite(maxFileSizeBytes) && maxFileSizeBytes > 0
    ? Math.floor(maxFileSizeBytes)
    : DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES;
  const safePerUserQuotaBytes = Number.isFinite(perUserQuotaBytes) && perUserQuotaBytes > 0
    ? Math.max(safeMaxFileSizeBytes, Math.floor(perUserQuotaBytes))
    : safeMaxFileSizeBytes;
  const quotaTracker = uploadQuotaTracker ?? createActiveImportUploadQuotaTracker(safePerUserQuotaBytes);

  return (req: AuthenticatedRequest, res, next) => {
    if (!req.is("multipart/form-data")) {
      next();
      return;
    }

    const responseLocals = ((res as unknown as { locals?: Record<string, unknown> }).locals
      ?? {}) as Record<string, unknown>;
    (res as unknown as { locals?: Record<string, unknown> }).locals = responseLocals;
    const quotaSubject = String(req.user?.username || "").trim().toLowerCase();
    const reservedQuotaBytes = quotaSubject ? safeMaxFileSizeBytes : 0;

    const parser = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fields: 4,
        fileSize: safeMaxFileSizeBytes,
      },
    });
    const parserStream = parser as NodeJS.WritableStream & {
      destroy?: (error?: Error) => void;
    };

    const body: MultipartImportBody = {};
    let fileTask: Promise<PreparedMultipartImportUpload> | null = null;
    let settled = false;
    let quotaReleased = false;
    const activeFileStreams = new Set<MultipartUploadFileStream>();

    const releaseQuota = () => {
      if (quotaReleased || !quotaSubject || reservedQuotaBytes <= 0) {
        return;
      }
      quotaReleased = true;
      quotaTracker.release(quotaSubject, reservedQuotaBytes);
    };

    const cleanupTrackedFileStreams = (error?: unknown) => {
      cleanupTrackedMultipartUploadStreamsForTests(activeFileStreams, error);
      activeFileStreams.clear();
    };

    const stopMultipartParsing = (error?: unknown) => {
      const cleanupError = toMultipartCleanupError(error);
      try {
        req.unpipe(parser);
      } catch {
        // Ignore best-effort request unpipe failures while tearing down multipart parsing.
      }

      try {
        parserStream.destroy?.(cleanupError);
      } catch {
        // Ignore best-effort parser teardown failures while tearing down multipart parsing.
      }

      cleanupTrackedFileStreams(cleanupError);
    };

    if (quotaSubject && !quotaTracker.tryReserve(quotaSubject, reservedQuotaBytes)) {
      res.status(413).json({
        ok: false,
        message:
          "You already have an import upload in progress that uses your per-user upload quota. Please wait and try again.",
      });
      return;
    }

    const fail = (status: number, message: string) => {
      if (settled) {
        return;
      }
      releaseQuota();
      settled = true;
      res.status(status).json({
        ok: false,
        message,
      });
    };

    parser.on("field", (fieldName, value) => {
      if (String(fieldName || "").trim() === "name") {
        body.name = String(value || "").trim().slice(0, 160);
      }
    });

    parser.on("file", (_fieldName, file, info) => {
      if (!info.filename || fileTask) {
        file.resume();
        return;
      }

      activeFileStreams.add(file);
      const unregisterStream = () => {
        activeFileStreams.delete(file);
      };
      file.once("close", unregisterStream);
      file.once("end", unregisterStream);
      file.once("error", unregisterStream);

      fileTask = (async () => {
        const filename = String(info.filename || "").trim();
        return prepareMultipartImportUpload({ file, filename });
      })();
    });

    parser.once("error", (error) => {
      logger.warn("Multipart import parser error", {
        error: error instanceof Error ? error.message : "Unknown multipart parser error",
      });
      stopMultipartParsing(error);
      if (fileTask) {
        void fileTask
          .then(async (upload) => {
            await cleanupPreparedMultipartImportUpload(upload);
          })
          .catch((cleanupError) => {
            logger.warn("Failed to cleanup staged multipart import upload after parser error", {
              error: cleanupError instanceof Error ? cleanupError.message : "Unknown upload cleanup failure",
            });
          });
      }

      const failure = resolveImportMultipartFailure(error);
      fail(failure.statusCode, failure.message);
    });

    parser.once("finish", async () => {
      if (settled) {
        return;
      }

      if (!fileTask) {
        fail(400, "Please select a CSV or Excel file to import.");
        return;
      }

      try {
        const upload = await fileTask;
        body.filename = upload.filename;
        body.name = normalizeImportName(body.name, upload.filename);
        if (upload.kind === "parsed") {
          body.data = upload.dataRows;
        } else {
          responseLocals.multipartImportUpload = upload;
        }
        releaseQuota();
        settled = true;
        req.body = body;
        next();
      } catch (error) {
        if (responseLocals.multipartImportUpload) {
          await cleanupPreparedMultipartImportUpload(responseLocals.multipartImportUpload as PreparedMultipartImportUpload);
          delete responseLocals.multipartImportUpload;
        }
        const failure = resolveImportMultipartFailure(error);
        fail(failure.statusCode, failure.message);
      }
    });

    req.once("error", (error) => {
      logger.warn("Multipart import request stream error", {
        error: error instanceof Error ? error.message : "Unknown request stream error",
      });
      stopMultipartParsing(error);
      releaseQuota();
      settled = true;
    });

    req.once("aborted", () => {
      stopMultipartParsing(new Error("Multipart import request aborted."));
      releaseQuota();
      settled = true;
    });

    req.pipe(parser);
  };
}
