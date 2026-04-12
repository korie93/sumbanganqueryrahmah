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
import { IMPORT_UPLOAD_TOO_LARGE_MESSAGE } from "../services/import-upload-file-utils";

export type MultipartImportBody = {
  name?: string;
  filename?: string;
  data?: Record<string, string>[];
};

export type PreparedMultipartImportUpload =
  | {
    kind: "parsed";
    filename: string;
    dataRows: Record<string, string>[];
  }
  | {
    kind: "csv-file";
    filename: string;
    filePath: string;
    tempDir: string;
  };

export const IMPORT_TOO_LARGE_MESSAGE = IMPORT_UPLOAD_TOO_LARGE_MESSAGE;

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

export async function prepareMultipartImportUpload(params: {
  file: NodeJS.ReadableStream;
  filename: string;
}): Promise<PreparedMultipartImportUpload> {
  const { file, filename } = params;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-upload-"));
  const tempFilePath = path.join(tempDir, `${Date.now()}-${randomUUID()}.upload`);
  let exceededSizeLimit = false;
  let keepStagedFile = false;

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

    if (String(filename || "").trim().toLowerCase().endsWith(".csv")) {
      keepStagedFile = true;
      return {
        kind: "csv-file",
        filename,
        filePath: tempFilePath,
        tempDir,
      };
    }

    const parsed = await parseImportUploadFile(filename, tempFilePath);
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    return {
      kind: "parsed",
      filename,
      dataRows: parsed.rows,
    };
  } finally {
    if (!keepStagedFile) {
      await rm(tempFilePath, { force: true }).catch(() => undefined);
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export async function cleanupPreparedMultipartImportUpload(
  upload: PreparedMultipartImportUpload | null | undefined,
): Promise<void> {
  if (!upload || upload.kind !== "csv-file") {
    return;
  }

  await rm(upload.filePath, { force: true }).catch(() => undefined);
  await rm(upload.tempDir, { recursive: true, force: true }).catch(() => undefined);
}
