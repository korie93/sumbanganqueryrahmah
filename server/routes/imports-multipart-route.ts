import Busboy from "busboy";
import type { RequestHandler } from "express";
import { DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES } from "../config/body-limit";
import {
  IMPORT_TOO_LARGE_MESSAGE,
  normalizeImportName,
  parseMultipartImportUpload,
  resolveImportMultipartFailure,
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
    let fileTask: Promise<{ filename: string; dataRows: Record<string, string>[] }> | null = null;
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
        return parseMultipartImportUpload({ file, filename });
      })();
    });

    parser.once("error", (error) => {
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
        const { filename, dataRows } = await fileTask;
        body.filename = filename;
        body.name = normalizeImportName(body.name, filename);
        body.data = dataRows;
        settled = true;
        req.body = body;
        next();
      } catch (error) {
        const failure = resolveImportMultipartFailure(error);
        fail(failure.statusCode, failure.message);
      }
    });

    req.pipe(parser);
  };
}
