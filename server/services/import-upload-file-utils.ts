import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
  formatBodyLimitBytes,
} from "../config/body-limit";
import { ERROR_CODES, type ErrorCode } from "../../shared/error-codes";
import type { ParsedImportUploadResult } from "./import-upload-types";

const SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN = /\.(csv|xlsx|xlsb)$/i;
const DANGEROUS_DOUBLE_EXTENSION_PATTERN =
  /\.(?:bat|cmd|com|cjs|exe|htm|html|js|mjs|php|ps1|sh|svg)\.(?:csv|xlsx|xlsb)$/i;
const MAX_IMPORT_UPLOAD_FILENAME_LENGTH = 255;
const GENERIC_UPLOAD_MIME_TYPES = new Set(["", "application/octet-stream"]);
const IMPORT_UPLOAD_MIME_TYPES = {
  csv: new Set([
    "application/csv",
    "application/vnd.ms-excel",
    "text/csv",
    "text/plain",
  ]),
  xlsb: new Set([
    "application/vnd.ms-excel",
    "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  ]),
  xlsx: new Set([
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
  ]),
} as const;
const DANGEROUS_CSV_PREFIX_PATTERN = /^(?:#!|<\?php\b|<html\b|<script\b)/i;
const IMPORT_UPLOAD_SIGNATURE_PREFIX_BYTES = 512;
export const UNSUPPORTED_IMPORT_UPLOAD_MESSAGE = "Please select a CSV, XLSX, or XLSB file.";
export const INVALID_IMPORT_UPLOAD_MESSAGE =
  "The selected file could not be verified as a safe CSV, XLSX, or XLSB file.";

type ImportUploadValidationCode =
  | typeof ERROR_CODES.IMPORT_PARSE_FAILED
  | typeof ERROR_CODES.IMPORT_UNSUPPORTED_FILE_TYPE;

export class ImportUploadValidationError extends Error {
  readonly code: ImportUploadValidationCode;

  constructor(message: string, code: ImportUploadValidationCode) {
    super(message);
    this.name = "ImportUploadValidationError";
    this.code = code;
  }
}

function getImportUploadExtension(filename: string): "csv" | "xlsb" | "xlsx" | null {
  const match = String(filename || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match || !["csv", "xlsb", "xlsx"].includes(match[1])) {
    return null;
  }
  return match[1] as "csv" | "xlsb" | "xlsx";
}

function normalizeMimeType(mimeType: string | undefined) {
  return String(mimeType || "").split(";", 1)[0].trim().toLowerCase();
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function hasZipFileSignature(prefix: Buffer) {
  return prefix.length >= 4
    && prefix[0] === 0x50
    && prefix[1] === 0x4b
    && (
      (prefix[2] === 0x03 && prefix[3] === 0x04)
      || (prefix[2] === 0x05 && prefix[3] === 0x06)
      || (prefix[2] === 0x07 && prefix[3] === 0x08)
    );
}

function assertSafeCsvSignature(prefix: Buffer) {
  if (prefix.includes(0)) {
    throw new ImportUploadValidationError(
      INVALID_IMPORT_UPLOAD_MESSAGE,
      ERROR_CODES.IMPORT_PARSE_FAILED,
    );
  }

  const normalizedPrefix = prefix
    .toString("utf8")
    .replace(/^\ufeff/, "")
    .trimStart()
    .toLowerCase();
  const isExecutableSignature =
    normalizedPrefix.startsWith("mz")
    || prefix.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  if (isExecutableSignature || DANGEROUS_CSV_PREFIX_PATTERN.test(normalizedPrefix)) {
    throw new ImportUploadValidationError(
      INVALID_IMPORT_UPLOAD_MESSAGE,
      ERROR_CODES.IMPORT_PARSE_FAILED,
    );
  }
}

export function normalizeAndValidateImportUploadFilename(rawFilename: string) {
  const filename = String(rawFilename || "").trim().normalize("NFKC");
  const basename = path.posix.basename(path.win32.basename(filename));

  if (
    !filename
    || filename.length > MAX_IMPORT_UPLOAD_FILENAME_LENGTH
    || filename === "."
    || filename === ".."
    || basename !== filename
    || hasControlCharacters(filename)
    || DANGEROUS_DOUBLE_EXTENSION_PATTERN.test(filename)
    || !isSupportedSpreadsheet(filename)
  ) {
    throw new ImportUploadValidationError(
      UNSUPPORTED_IMPORT_UPLOAD_MESSAGE,
      ERROR_CODES.IMPORT_UNSUPPORTED_FILE_TYPE,
    );
  }

  return filename;
}

export function validateImportUploadMimeType(filename: string, mimeType?: string) {
  const extension = getImportUploadExtension(filename);
  const normalizedMimeType = normalizeMimeType(mimeType);
  if (!extension) {
    throw new ImportUploadValidationError(
      UNSUPPORTED_IMPORT_UPLOAD_MESSAGE,
      ERROR_CODES.IMPORT_UNSUPPORTED_FILE_TYPE,
    );
  }

  if (
    !GENERIC_UPLOAD_MIME_TYPES.has(normalizedMimeType)
    && !IMPORT_UPLOAD_MIME_TYPES[extension].has(normalizedMimeType)
  ) {
    throw new ImportUploadValidationError(
      UNSUPPORTED_IMPORT_UPLOAD_MESSAGE,
      ERROR_CODES.IMPORT_UNSUPPORTED_FILE_TYPE,
    );
  }
}

export function validateImportUploadBufferSignature(filename: string, buffer: Buffer) {
  const extension = getImportUploadExtension(filename);
  const prefix = buffer.subarray(0, IMPORT_UPLOAD_SIGNATURE_PREFIX_BYTES);
  if (extension === "csv") {
    assertSafeCsvSignature(prefix);
    return;
  }

  if (!extension || !hasZipFileSignature(prefix)) {
    throw new ImportUploadValidationError(
      INVALID_IMPORT_UPLOAD_MESSAGE,
      ERROR_CODES.IMPORT_PARSE_FAILED,
    );
  }
}

export async function validateImportUploadFileSignature(filename: string, filePath: string) {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const prefix = Buffer.alloc(IMPORT_UPLOAD_SIGNATURE_PREFIX_BYTES);
    const { bytesRead } = await handle.read(
      prefix,
      0,
      IMPORT_UPLOAD_SIGNATURE_PREFIX_BYTES,
      0,
    );
    validateImportUploadBufferSignature(filename, prefix.subarray(0, bytesRead));
  } catch (error) {
    if (error instanceof ImportUploadValidationError) {
      throw error;
    }
    if (isFileAccessError(error)) {
      throw new Error("Cannot access the uploaded file. Please try again.");
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

export function resolveImportUploadErrorCode(error: unknown): ErrorCode {
  if (error instanceof ImportUploadValidationError) {
    return error.code;
  }

  const message = error instanceof Error ? error.message : String(error || "");
  if (/too large|size limit/i.test(message)) {
    return ERROR_CODES.IMPORT_FILE_TOO_LARGE;
  }
  if (/select a CSV, XLSX, or XLSB|unsupported file type/i.test(message)) {
    return ERROR_CODES.IMPORT_UNSUPPORTED_FILE_TYPE;
  }
  return ERROR_CODES.IMPORT_PARSE_FAILED;
}

export function buildImportUploadTooLargeMessage(
  maxBytes: number = DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
) {
  const safeMaxBytes = Number.isFinite(maxBytes) && maxBytes > 0
    ? Math.floor(maxBytes)
    : DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES;
  return `The selected file is too large to import. Maximum upload size is ${formatBodyLimitBytes(safeMaxBytes)}. Split it into smaller files or ask an administrator to raise the import upload limit.`;
}

export const IMPORT_UPLOAD_TOO_LARGE_MESSAGE = buildImportUploadTooLargeMessage();

export function isFileAccessError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  return ["ENOENT", "EACCES", "EPERM", "EBUSY"].includes(code);
}

export function createUploadFileAccessError(): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: "Cannot access the uploaded file. Please try again.",
  };
}

export function createUploadFileTooLargeError(maxBytes?: number): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: buildImportUploadTooLargeMessage(maxBytes),
  };
}

export async function validateUploadFileSize(
  filePath: string,
  maxBytes?: number,
): Promise<ParsedImportUploadResult | null> {
  if (!Number.isFinite(maxBytes) || (maxBytes as number) <= 0) {
    return null;
  }

  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch (error) {
    if (isFileAccessError(error)) {
      return createUploadFileAccessError();
    }
    throw error;
  }

  return stats.size > (maxBytes as number)
    ? createUploadFileTooLargeError(maxBytes)
    : null;
}

export function isSupportedSpreadsheet(filename: string) {
  return SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN.test(filename);
}

export function stripImportUploadExtension(filename: string) {
  return filename.replace(SUPPORTED_IMPORT_UPLOAD_EXTENSION_PATTERN, "");
}
