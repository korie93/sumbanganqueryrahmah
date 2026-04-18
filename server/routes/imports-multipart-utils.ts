import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { logger } from "../lib/logger";
import {
  parseImportUploadFile,
  stripImportUploadExtension,
} from "../services/import-upload-parser";
import {
  IMPORT_UPLOAD_TOO_LARGE_MESSAGE,
  isSupportedSpreadsheet,
} from "../services/import-upload-file-utils";

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
const IMPORT_UPLOAD_INVALID_TYPE_MESSAGE = "Please select a CSV or Excel file (.xlsx, .xls, .xlsb).";
const IMPORT_UPLOAD_MIME_WHITELIST_BY_EXTENSION = {
  ".csv": new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"]),
  ".xlsx": new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
  ".xls": new Set(["application/vnd.ms-excel"]),
  ".xlsb": new Set(["application/vnd.ms-excel.sheet.binary.macroenabled.12"]),
} as const;

function validateMultipartImportType(filename: string, mimeType?: string) {
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  if (!isSupportedSpreadsheet(normalizedFilename)) {
    throw new Error(IMPORT_UPLOAD_INVALID_TYPE_MESSAGE);
  }

  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  if (!normalizedMimeType || normalizedMimeType === "application/octet-stream") {
    return;
  }

  const extension = path.extname(normalizedFilename) as keyof typeof IMPORT_UPLOAD_MIME_WHITELIST_BY_EXTENSION;
  const allowedMimeTypes = IMPORT_UPLOAD_MIME_WHITELIST_BY_EXTENSION[extension];
  if (!allowedMimeTypes?.has(normalizedMimeType)) {
    throw new Error(IMPORT_UPLOAD_INVALID_TYPE_MESSAGE);
  }
}

async function cleanupImportUploadPath(
  targetPath: string,
  options: { recursive?: boolean; force?: boolean },
  targetType: "file" | "directory",
) {
  try {
    await rm(targetPath, options);
  } catch (error) {
    logger.warn("Failed to cleanup staged import upload path", {
      targetPath,
      targetType,
      error: error instanceof Error ? error.message : "Unknown cleanup failure",
    });
  }
}

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
  mimeType?: string;
}) {
  const { file, filename, mimeType } = params;
  validateMultipartImportType(filename, mimeType);
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

    const parsed = await parseImportUploadFile(filename, tempFilePath, {
      allowedRootDir: tempDir,
    });
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    return {
      dataRows: parsed.rows,
      filename,
    };
  } finally {
    await cleanupImportUploadPath(tempFilePath, { force: true }, "file");
    await cleanupImportUploadPath(tempDir, { recursive: true, force: true }, "directory");
  }
}

export async function prepareMultipartImportUpload(params: {
  file: NodeJS.ReadableStream;
  filename: string;
  mimeType?: string;
}): Promise<PreparedMultipartImportUpload> {
  const { file, filename, mimeType } = params;
  validateMultipartImportType(filename, mimeType);
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

    const parsed = await parseImportUploadFile(filename, tempFilePath, {
      allowedRootDir: tempDir,
    });
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
      await cleanupImportUploadPath(tempFilePath, { force: true }, "file");
      await cleanupImportUploadPath(tempDir, { recursive: true, force: true }, "directory");
    }
  }
}

export async function cleanupPreparedMultipartImportUpload(
  upload: PreparedMultipartImportUpload | null | undefined,
): Promise<void> {
  if (!upload || upload.kind !== "csv-file") {
    return;
  }

  await cleanupImportUploadPath(upload.filePath, { force: true }, "file");
  await cleanupImportUploadPath(upload.tempDir, { recursive: true, force: true }, "directory");
}
