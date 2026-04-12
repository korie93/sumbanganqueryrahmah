import Busboy from "busboy";
import type { RequestHandler } from "express";
import { DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES } from "../config/body-limit";
import {
  cleanupPreparedMultipartImportUpload,
  normalizeImportName,
  prepareMultipartImportUpload,
  resolveImportMultipartFailure,
  type PreparedMultipartImportUpload,
  type MultipartImportBody,
} from "./imports-multipart-utils";

export function createImportsMultipartRoute(
  maxFileSizeBytes: number = DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
): RequestHandler {
  return (req, res, next) => {
    if (!req.is("multipart/form-data")) {
      next();
      return;
    }

    const responseLocals = ((res as unknown as { locals?: Record<string, unknown> }).locals
      ?? {}) as Record<string, unknown>;
    (res as unknown as { locals?: Record<string, unknown> }).locals = responseLocals;

    const safeMaxFileSizeBytes = Number.isFinite(maxFileSizeBytes) && maxFileSizeBytes > 0
      ? Math.floor(maxFileSizeBytes)
      : DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES;

    const parser = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fields: 4,
        fileSize: safeMaxFileSizeBytes,
      },
    });

    const body: MultipartImportBody = {};
    let fileTask: Promise<PreparedMultipartImportUpload> | null = null;
    let settled = false;

    const fail = (status: number, message: string) => {
      if (settled) {
        return;
      }
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

      fileTask = (async () => {
        const filename = String(info.filename || "").trim();
        return prepareMultipartImportUpload({ file, filename });
      })();
    });

    parser.once("error", (error) => {
      if (fileTask) {
        void fileTask
          .then(async (upload) => {
            await cleanupPreparedMultipartImportUpload(upload);
          })
          .catch(() => undefined);
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

    req.pipe(parser);
  };
}
