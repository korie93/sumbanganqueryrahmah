import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import {
  parseImportUploadFile,
  stripImportUploadExtension,
} from "../services/import-upload-parser";

export type MultipartImportBody = {
  name?: string;
  filename?: string;
  data?: Record<string, string>[];
};

export const IMPORT_TOO_LARGE_MESSAGE = "The selected file is too large to import. Please split it into smaller files and try again.";

export function normalizeImportName(rawValue: string | undefined, fallbackFilename: string) {
  const normalized = String(rawValue || "").trim();
  if (normalized) {
    return normalized.slice(0, 160);
  }

  return stripImportUploadExtension(fallbackFilename).slice(0, 160);
}

export function resolveImportMultipartFailure(error: unknown, fallbackMessage = "Failed to parse import upload.") {
  const message =
    error instanceof Error && error.message
      ? error.message
      : fallbackMessage;

  const statusCode = /too large|size limit/i.test(message) ? 413 : 400;
  return {
    message: statusCode === 413 ? IMPORT_TOO_LARGE_MESSAGE : message,
    statusCode,
  };
}

export async function parseMultipartImportUpload(params: {
  file: NodeJS.ReadableStream;
  filename: string;
}) {
  const { file, filename } = params;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-upload-"));
  const tempFilePath = path.join(tempDir, `${Date.now()}-${randomUUID()}.upload`);
  let exceededSizeLimit = false;

  file.once("limit", () => {
    exceededSizeLimit = true;
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
      dataRows: parsed.rows,
      filename,
    };
  } finally {
    await rm(tempFilePath, { force: true }).catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
