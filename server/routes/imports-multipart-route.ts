import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import Busboy from "busboy";
import type { RequestHandler } from "express";
import {
  parseImportUploadFile,
  stripImportUploadExtension,
} from "../services/import-upload-parser";
import { DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES } from "../config/body-limit";

type MultipartImportBody = {
  name?: string;
  filename?: string;
  data?: Record<string, string>[];
};

const IMPORT_TOO_LARGE_MESSAGE = "The selected file is too large to import. Please split it into smaller files and try again.";

function normalizeImportName(rawValue: string | undefined, fallbackFilename: string) {
  const normalized = String(rawValue || "").trim();
  if (normalized) {
    return normalized.slice(0, 160);
  }

  return stripImportUploadExtension(fallbackFilename).slice(0, 160);
}

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
    let fileLimitExceeded = false;

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
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-upload-"));
        const tempFilePath = path.join(tempDir, `${Date.now()}-${randomUUID()}.upload`);
        let exceededSizeLimit = false;

        file.once("limit", () => {
          exceededSizeLimit = true;
          fileLimitExceeded = true;
        });

        try {
          await pipeline(
            file,
            fs.createWriteStream(tempFilePath, { flags: "wx" }),
          );

          if (exceededSizeLimit) {
            throw new Error(IMPORT_TOO_LARGE_MESSAGE);
          }

          const parsed = await parseImportUploadFile(filename, tempFilePath);
          if (parsed.error) {
            throw new Error(parsed.error);
          }

          return {
            filename,
            dataRows: parsed.rows,
          };
        } finally {
          await rm(tempFilePath, { force: true }).catch(() => undefined);
          await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
      })();
    });

    parser.once("error", (error) => {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to parse import upload.";
      fail(fileLimitExceeded || /too large|size limit/i.test(message) ? 413 : 400, fileLimitExceeded ? IMPORT_TOO_LARGE_MESSAGE : message);
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
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Failed to parse import upload.";
        const statusCode = fileLimitExceeded || /too large/i.test(message) ? 413 : 400;
        fail(statusCode, fileLimitExceeded ? IMPORT_TOO_LARGE_MESSAGE : message);
      }
    });

    req.pipe(parser);
  };
}
