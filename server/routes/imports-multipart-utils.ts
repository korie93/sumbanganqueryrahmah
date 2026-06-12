import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { logger } from "../lib/logger";
import {
  parseImportUploadFile,
  stripImportUploadExtension,
} from "../services/import-upload-parser";
import {
  buildImportUploadTooLargeMessage,
  ImportUploadValidationError,
  IMPORT_UPLOAD_TOO_LARGE_MESSAGE,
  normalizeAndValidateImportUploadFilename,
  resolveImportUploadErrorCode,
  validateImportUploadFileSignature,
} from "../services/import-upload-file-utils";
import { ERROR_CODES } from "../../shared/error-codes";

export type MultipartImportBody = {
  name?: string;
  filename?: string;
  data?: Record<string, string>[];
  columnMapping?: string;
};

export type PreparedMultipartImportUpload = {
  kind: "staged-file";
  filename: string;
  filePath: string;
  tempDir: string;
  contentHashSha256: string;
  sourceSizeBytes: number;
};

export const IMPORT_TOO_LARGE_MESSAGE = IMPORT_UPLOAD_TOO_LARGE_MESSAGE;
const IMPORT_UPLOAD_TEMP_DIR_PREFIX = "sqr-import-upload-";

type LimitAwareReadableStream = NodeJS.ReadableStream & {
  off?: (event: "limit", listener: () => void) => unknown;
  removeListener?: (event: "limit", listener: () => void) => unknown;
  truncated?: boolean;
};

function removeLimitListener(file: NodeJS.ReadableStream, listener: () => void) {
  const limitAwareFile = file as LimitAwareReadableStream;
  if (typeof limitAwareFile.off === "function") {
    limitAwareFile.off("limit", listener);
    return;
  }
  limitAwareFile.removeListener?.("limit", listener);
}

export function resolveImportUploadTempRootDir() {
  return process.env.UPLOAD_TMP_DIR?.trim() || os.tmpdir();
}

async function createImportUploadTempDir() {
  const tempRootDir = resolveImportUploadTempRootDir();
  await mkdir(tempRootDir, { recursive: true });
  return mkdtemp(path.join(tempRootDir, IMPORT_UPLOAD_TEMP_DIR_PREFIX));
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

export function resolveImportMultipartFailure(
  error: unknown,
  fallbackMessage = "Failed to parse import upload.",
  maxFileSizeBytes?: number,
) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : fallbackMessage;

  const statusCode = /too large|size limit/i.test(message) ? 413 : 400;
  return {
    code: resolveImportUploadErrorCode(error),
    message: statusCode === 413 ? buildImportUploadTooLargeMessage(maxFileSizeBytes) : message,
    statusCode,
  };
}

export async function parseMultipartImportUpload(params: {
  file: NodeJS.ReadableStream;
  filename: string;
}) {
  const { file } = params;
  const filename = normalizeAndValidateImportUploadFilename(params.filename);
  const tempDir = await createImportUploadTempDir();
  const tempFilePath = path.join(tempDir, `${Date.now()}-${randomUUID()}.upload`);
  let exceededSizeLimit = false;

  const handleLimit = () => {
    exceededSizeLimit = true;
  };
  file.once("limit", handleLimit);

  try {
    await pipeline(
      file,
      fs.createWriteStream(tempFilePath, { flags: "wx" }),
    );

    if (exceededSizeLimit || (file as LimitAwareReadableStream).truncated === true) {
      throw new Error(IMPORT_TOO_LARGE_MESSAGE);
    }
    await validateImportUploadFileSignature(filename, tempFilePath);

    const parsed = await parseImportUploadFile(filename, tempFilePath);
    if (parsed.error) {
      throw new ImportUploadValidationError(
        parsed.error,
        ERROR_CODES.IMPORT_PARSE_FAILED,
      );
    }

    return {
      dataRows: parsed.rows,
      filename,
    };
  } finally {
    removeLimitListener(file, handleLimit);
    await cleanupImportUploadPath(tempFilePath, { force: true }, "file");
    await cleanupImportUploadPath(tempDir, { recursive: true, force: true }, "directory");
  }
}

export async function prepareMultipartImportUpload(params: {
  file: NodeJS.ReadableStream;
  filename: string;
}): Promise<PreparedMultipartImportUpload> {
  const { file } = params;
  const filename = normalizeAndValidateImportUploadFilename(params.filename);
  const tempDir = await createImportUploadTempDir();
  const tempFilePath = path.join(tempDir, `${Date.now()}-${randomUUID()}.upload`);
  let exceededSizeLimit = false;
  let keepStagedFile = false;
  let sourceSizeBytes = 0;
  const contentHasher = createHash("sha256");
  const hashingStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sourceSizeBytes += chunk.length;
      contentHasher.update(chunk);
      callback(null, chunk);
    },
  });

  const handleLimit = () => {
    exceededSizeLimit = true;
  };
  file.once("limit", handleLimit);

  try {
    await pipeline(
      file,
      hashingStream,
      fs.createWriteStream(tempFilePath, { flags: "wx" }),
    );

    if (exceededSizeLimit || (file as LimitAwareReadableStream).truncated === true) {
      throw new Error(IMPORT_TOO_LARGE_MESSAGE);
    }
    await validateImportUploadFileSignature(filename, tempFilePath);

    keepStagedFile = true;
    return {
      kind: "staged-file",
      filename,
      filePath: tempFilePath,
      tempDir,
      contentHashSha256: contentHasher.digest("hex"),
      sourceSizeBytes,
    };
  } finally {
    removeLimitListener(file, handleLimit);
    if (!keepStagedFile) {
      await cleanupImportUploadPath(tempFilePath, { force: true }, "file");
      await cleanupImportUploadPath(tempDir, { recursive: true, force: true }, "directory");
    }
  }
}

export async function cleanupPreparedMultipartImportUpload(
  upload: PreparedMultipartImportUpload | null | undefined,
): Promise<void> {
  if (!upload || upload.kind !== "staged-file") {
    return;
  }

  await cleanupImportUploadPath(upload.filePath, { force: true }, "file");
  await cleanupImportUploadPath(upload.tempDir, { recursive: true, force: true }, "directory");
}
