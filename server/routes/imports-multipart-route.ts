import Busboy from "busboy";
import type { AuthenticatedRequest } from "../auth/guards";
import type { RequestHandler } from "express";
import { DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES } from "../config/body-limit";
import { buildApiErrorResponse } from "../http/api-error-response";
import { logger } from "../lib/logger";
import { ERROR_CODES, type ErrorCode } from "../../shared/error-codes";
import {
  normalizeAndValidateImportUploadFilename,
  validateImportUploadMimeType,
} from "../services/import-upload-file-utils";
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
  once?: (event: "close" | "end" | "error", listener: () => void) => unknown;
  resume?: () => void;
  unpipe?: (destination?: NodeJS.WritableStream | undefined) => unknown;
};

type MultipartTrackedStreamCleanupStep = "unpipe" | "resume" | "destroy";

type MultipartTrackedStreamCleanupObserver = (
  step: MultipartTrackedStreamCleanupStep,
  error: Error | undefined,
) => void;

type MultipartResponseLocals = Record<string, unknown> & {
  multipartImportUpload?: PreparedMultipartImportUpload;
};

type MultipartResponseLifecycle = {
  once(event: "finish" | "close", listener: () => void): unknown;
};

const IMPORT_MULTIPART_FILE_STREAM_TIMEOUT_MS = 30_000;
const IMPORT_MULTIPART_FIELD_VALUE_MAX_BYTES = 64 * 1_024;
const ALLOWED_IMPORT_MULTIPART_FIELD_NAMES = new Set(["name", "columnMapping"]);
const ALLOWED_IMPORT_MULTIPART_FILE_FIELD_NAMES = new Set(["file"]);

function createMultipartUploadStreamRegistry() {
  const streams = new Set<MultipartUploadFileStream>();
  const timeouts = new Map<MultipartUploadFileStream, NodeJS.Timeout>();

  return {
    get size() {
      return streams.size;
    },
    add(file: MultipartUploadFileStream): void {
      streams.add(file);
    },
    has(file: MultipartUploadFileStream): boolean {
      return streams.has(file);
    },
    delete(file: MultipartUploadFileStream): void {
      const timeoutId = timeouts.get(file);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeouts.delete(file);
      }
      streams.delete(file);
    },
    setTimeout(file: MultipartUploadFileStream, timeoutId: NodeJS.Timeout): void {
      timeouts.set(file, timeoutId);
    },
    cleanup(
      error: unknown,
      onCleanupFailure?: MultipartTrackedStreamCleanupObserver,
    ): number {
      for (const timeoutId of timeouts.values()) {
        clearTimeout(timeoutId);
      }
      timeouts.clear();
      const cleaned = cleanupTrackedMultipartUploadStreamsForTests(
        [...streams],
        error,
        onCleanupFailure,
      );
      streams.clear();
      return cleaned;
    },
  };
}

function toMultipartCleanupError(error: unknown): Error | undefined {
  if (error instanceof Error) {
    return error;
  }

  return error == null ? undefined : new Error(String(error));
}

function attachPreparedUploadResponseCleanup(params: {
  res: MultipartResponseLifecycle;
  responseLocals: MultipartResponseLocals;
  upload: PreparedMultipartImportUpload;
  onCleanupFailure: (
    step: string,
    cleanupFailure: unknown,
    details?: Record<string, unknown>,
  ) => void;
}) {
  const { res, responseLocals, upload, onCleanupFailure } = params;
  if (upload.kind !== "staged-file") {
    return;
  }

  let cleanupStarted = false;
  const cleanupOnce = (reason: "response-finish" | "response-close") => {
    if (cleanupStarted || responseLocals.multipartImportUpload !== upload) {
      return;
    }

    cleanupStarted = true;
    delete responseLocals.multipartImportUpload;
    void (async () => {
      try {
        await cleanupPreparedMultipartImportUpload(upload);
      } catch (cleanupFailure) {
        onCleanupFailure("prepared-upload-response", cleanupFailure, { reason });
      }
    })();
  };

  res.once("finish", () => cleanupOnce("response-finish"));
  res.once("close", () => cleanupOnce("response-close"));
}

export function cleanupTrackedMultipartUploadStreamsForTests(
  streams: Iterable<MultipartUploadFileStream>,
  error?: unknown,
  onCleanupFailure?: MultipartTrackedStreamCleanupObserver,
): number {
  const cleanupError = toMultipartCleanupError(error);
  let cleaned = 0;

  for (const stream of streams) {
    try {
      stream.unpipe?.();
    } catch (cleanupFailure) {
      onCleanupFailure?.("unpipe", toMultipartCleanupError(cleanupFailure));
    }

    try {
      stream.resume?.();
    } catch (cleanupFailure) {
      onCleanupFailure?.("resume", toMultipartCleanupError(cleanupFailure));
    }

    try {
      stream.destroy?.(cleanupError);
      cleaned += 1;
    } catch (cleanupFailure) {
      onCleanupFailure?.("destroy", toMultipartCleanupError(cleanupFailure));
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

    const responseLocals = ((res as unknown as { locals?: MultipartResponseLocals }).locals
      ?? {}) as MultipartResponseLocals;
    (res as unknown as { locals?: Record<string, unknown> }).locals = responseLocals;
    const quotaSubject = String(req.user?.username || "").trim().toLowerCase();
    const reservedQuotaBytes = quotaSubject ? safeMaxFileSizeBytes : 0;

    const parser = Busboy({
      headers: req.headers,
      limits: {
        fieldNameSize: 64,
        fieldSize: IMPORT_MULTIPART_FIELD_VALUE_MAX_BYTES,
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
    let fileValidationError: unknown = null;
    let settled = false;
    let quotaReleased = false;
    const activeFileStreams = createMultipartUploadStreamRegistry();
    const logMultipartCleanupFailure = (
      step: string,
      cleanupFailure: unknown,
      details?: Record<string, unknown>,
    ) => {
      logger.warn("Multipart import cleanup failed", {
        step,
        error: toMultipartCleanupError(cleanupFailure)?.message ?? "Unknown multipart cleanup failure",
        ...details,
      });
    };

    const releaseQuota = () => {
      if (quotaReleased || !quotaSubject || reservedQuotaBytes <= 0) {
        return;
      }
      quotaReleased = true;
      quotaTracker.release(quotaSubject, reservedQuotaBytes);
    };

    const cleanupTrackedFileStreams = (error?: unknown) => {
      activeFileStreams.cleanup(error, (step, cleanupFailure) => {
        logMultipartCleanupFailure(`file-stream:${step}`, cleanupFailure, {
          trackedStreamCount: activeFileStreams.size,
        });
      });
    };

    const stopMultipartParsing = (error?: unknown) => {
      const cleanupError = toMultipartCleanupError(error);
      try {
        req.unpipe(parser);
      } catch (cleanupFailure) {
        logMultipartCleanupFailure("request-unpipe", cleanupFailure);
      }

      try {
        parserStream.destroy?.(cleanupError);
      } catch (cleanupFailure) {
        logMultipartCleanupFailure("parser-destroy", cleanupFailure);
      }

      cleanupTrackedFileStreams(cleanupError);
    };

    const trackFileStream = (file: MultipartUploadFileStream) => {
      activeFileStreams.add(file);

      const unregisterStream = () => {
        activeFileStreams.delete(file);
      };

      const timeoutId = setTimeout(() => {
        if (!activeFileStreams.has(file)) {
          return;
        }

        logger.warn("Multipart import file stream timed out before completion", {
          event: "multipart_import_file_stream_timeout",
          timeoutMs: IMPORT_MULTIPART_FILE_STREAM_TIMEOUT_MS,
          trackedStreamCount: activeFileStreams.size,
        });

        try {
          file.destroy?.(new Error("Multipart import file stream timed out."));
        } catch (cleanupFailure) {
          logMultipartCleanupFailure("file-stream:timeout-destroy", cleanupFailure, {
            trackedStreamCount: activeFileStreams.size,
          });
        } finally {
          unregisterStream();
        }
      }, IMPORT_MULTIPART_FILE_STREAM_TIMEOUT_MS);
      timeoutId.unref?.();
      activeFileStreams.setTimeout(file, timeoutId);

      file.once?.("close", unregisterStream);
      file.once?.("end", unregisterStream);
      file.once?.("error", unregisterStream);
    };

    if (quotaSubject && !quotaTracker.tryReserve(quotaSubject, reservedQuotaBytes)) {
      const message =
        "You already have an import upload in progress that uses your per-user upload quota. Please wait and try again.";
      res.status(413).json(buildApiErrorResponse(message, {
        code: ERROR_CODES.IMPORT_UPLOAD_RATE_LIMITED,
        statusCode: 413,
      }));
      return;
    }

    const fail = (status: number, message: string, code?: ErrorCode) => {
      if (settled) {
        return;
      }
      releaseQuota();
      settled = true;
      res.status(status).json(buildApiErrorResponse(message, {
        code,
        statusCode: status,
      }));
    };

    parser.on("field", (fieldName, value) => {
      const normalizedFieldName = String(fieldName || "").trim();
      if (!ALLOWED_IMPORT_MULTIPART_FIELD_NAMES.has(normalizedFieldName)) {
        logger.warn("Ignored unknown multipart import field", {
          event: "multipart_import_unknown_field_ignored",
          fieldName: normalizedFieldName.slice(0, 64),
        });
        return;
      }

      if (normalizedFieldName === "name") {
        body.name = String(value || "").trim().slice(0, 160);
      } else if (normalizedFieldName === "columnMapping") {
        body.columnMapping = String(value || "").trim();
      }
    });

    parser.on("file", (fieldName, file, info) => {
      const normalizedFieldName = String(fieldName || "").trim();
      if (!ALLOWED_IMPORT_MULTIPART_FILE_FIELD_NAMES.has(normalizedFieldName)) {
        logger.warn("Ignored unknown multipart import file field", {
          event: "multipart_import_unknown_file_field_ignored",
          fieldName: normalizedFieldName.slice(0, 64),
        });
        file.resume();
        return;
      }

      if (!info.filename || fileTask) {
        file.resume();
        return;
      }

      try {
        const filename = normalizeAndValidateImportUploadFilename(info.filename);
        validateImportUploadMimeType(filename, info.mimeType);
        trackFileStream(file);
        fileTask = prepareMultipartImportUpload({ file, filename });
        void fileTask.catch(() => {
          // The parser finish/error handlers own the response and cleanup.
        });
      } catch (error) {
        fileValidationError = error;
        file.resume();
      }
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

      const failure = resolveImportMultipartFailure(error, undefined, safeMaxFileSizeBytes);
      fail(failure.statusCode, failure.message, failure.code);
    });

    parser.once("finish", async () => {
      if (settled) {
        return;
      }

      if (fileValidationError) {
        const failure = resolveImportMultipartFailure(
          fileValidationError,
          undefined,
          safeMaxFileSizeBytes,
        );
        fail(failure.statusCode, failure.message, failure.code);
        return;
      }

      if (!fileTask) {
        fail(
          400,
          "Please select a CSV, XLSX, or XLSB file to import.",
          ERROR_CODES.IMPORT_UNSUPPORTED_FILE_TYPE,
        );
        return;
      }

      try {
        const upload = await fileTask;
        body.filename = upload.filename;
        body.name = normalizeImportName(body.name, upload.filename);
        responseLocals.multipartImportUpload = upload;
        attachPreparedUploadResponseCleanup({
          res: res as unknown as MultipartResponseLifecycle,
          responseLocals,
          upload,
          onCleanupFailure: logMultipartCleanupFailure,
        });
        releaseQuota();
        settled = true;
        req.body = body;
        next();
      } catch (error) {
        if (responseLocals.multipartImportUpload) {
          await cleanupPreparedMultipartImportUpload(responseLocals.multipartImportUpload as PreparedMultipartImportUpload);
          delete responseLocals.multipartImportUpload;
        }
        const failure = resolveImportMultipartFailure(error, undefined, safeMaxFileSizeBytes);
        fail(failure.statusCode, failure.message, failure.code);
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
      if (settled) {
        return;
      }
      stopMultipartParsing(new Error("Multipart import request aborted before completion."));
      releaseQuota();
      settled = true;
    });

    req.once("close", () => {
      if (settled || req.complete || req.readableEnded) {
        return;
      }
      stopMultipartParsing(new Error("Multipart import request closed before completion."));
      releaseQuota();
      settled = true;
    });

    req.pipe(parser);
  };
}
