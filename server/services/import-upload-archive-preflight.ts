import {
  Unzip,
  UnzipInflate,
  type UnzipFile,
} from "fflate";

export type SpreadsheetArchivePreflightOptions = {
  maxArchiveCompressionRatio?: number;
  maxArchiveEntries?: number;
  maxArchiveEntryUncompressedBytes?: number;
  maxArchiveUncompressedBytes?: number;
};

export type SpreadsheetArchivePreflightResult =
  | {
      success: true;
      entryCount: number;
      uncompressedBytes: number;
    }
  | {
      success: false;
      error: string;
    };

export const DEFAULT_SPREADSHEET_ARCHIVE_MAX_ENTRIES = 4_096;
export const DEFAULT_SPREADSHEET_ARCHIVE_MAX_ENTRY_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
export const DEFAULT_SPREADSHEET_ARCHIVE_MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
export const DEFAULT_SPREADSHEET_ARCHIVE_MAX_COMPRESSION_RATIO = 250;

const ARCHIVE_STREAM_CHUNK_BYTES = 64 * 1024;
const MAX_ARCHIVE_ENTRY_NAME_LENGTH = 1_024;
const SPREADSHEET_ARCHIVE_LIMIT_ERROR =
  "Spreadsheet archive expands beyond the safe processing limit. Split the workbook into smaller files or recreate it without embedded bulk data.";
const SPREADSHEET_ARCHIVE_INVALID_ERROR =
  "Spreadsheet archive is corrupted or uses an unsupported format.";

export function isSpreadsheetArchivePreflightError(message: string | undefined): boolean {
  return message === SPREADSHEET_ARCHIVE_LIMIT_ERROR
    || message === SPREADSHEET_ARCHIVE_INVALID_ERROR;
}

class SpreadsheetArchivePreflightError extends Error {
  constructor(readonly kind: "invalid" | "limit") {
    super(kind === "limit" ? SPREADSHEET_ARCHIVE_LIMIT_ERROR : SPREADSHEET_ARCHIVE_INVALID_ERROR);
    this.name = "SpreadsheetArchivePreflightError";
  }
}

function resolvePositiveLimit(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.trunc(value));
}

function assertSafeArchiveEntryName(name: string, knownNames: Set<string>): void {
  const segments = name.split("/");
  if (
    !name
    || name.length > MAX_ARCHIVE_ENTRY_NAME_LENGTH
    || name.includes("\\")
    || name.includes("\0")
    || name.startsWith("/")
    || segments.some((segment) => segment === "..")
    || knownNames.has(name)
  ) {
    throw new SpreadsheetArchivePreflightError("invalid");
  }
  knownNames.add(name);
}

function assertSafeDeclaredSize(value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new SpreadsheetArchivePreflightError("invalid");
  }
}

function terminateArchiveFiles(files: ReadonlySet<UnzipFile>): void {
  for (const file of files) {
    try {
      file.terminate();
    } catch {
      // Best-effort cleanup after a malformed or oversized archive aborts parsing.
    }
  }
}

export function preflightSpreadsheetArchive(
  buffer: Buffer,
  options?: SpreadsheetArchivePreflightOptions,
): SpreadsheetArchivePreflightResult {
  const maxEntries = resolvePositiveLimit(
    options?.maxArchiveEntries,
    DEFAULT_SPREADSHEET_ARCHIVE_MAX_ENTRIES,
  );
  const maxEntryUncompressedBytes = resolvePositiveLimit(
    options?.maxArchiveEntryUncompressedBytes,
    DEFAULT_SPREADSHEET_ARCHIVE_MAX_ENTRY_UNCOMPRESSED_BYTES,
  );
  const maxUncompressedBytes = resolvePositiveLimit(
    options?.maxArchiveUncompressedBytes,
    DEFAULT_SPREADSHEET_ARCHIVE_MAX_UNCOMPRESSED_BYTES,
  );
  const maxCompressionRatio = resolvePositiveLimit(
    options?.maxArchiveCompressionRatio,
    DEFAULT_SPREADSHEET_ARCHIVE_MAX_COMPRESSION_RATIO,
  );

  let entryCount = 0;
  let completedEntries = 0;
  let declaredUncompressedBytes = 0;
  let actualUncompressedBytes = 0;
  const activeFiles = new Set<UnzipFile>();
  const knownNames = new Set<string>();

  try {
    const unzip = new Unzip((file) => {
      entryCount += 1;
      if (entryCount > maxEntries) {
        throw new SpreadsheetArchivePreflightError("limit");
      }

      assertSafeArchiveEntryName(file.name, knownNames);
      assertSafeDeclaredSize(file.size);
      assertSafeDeclaredSize(file.originalSize);
      if (file.compression !== 0 && file.compression !== 8) {
        throw new SpreadsheetArchivePreflightError("invalid");
      }

      const declaredEntryBytes = file.originalSize;
      const compressedEntryBytes = file.size;
      if (declaredEntryBytes !== undefined) {
        declaredUncompressedBytes += declaredEntryBytes;
        if (
          declaredEntryBytes > maxEntryUncompressedBytes
          || declaredUncompressedBytes > maxUncompressedBytes
        ) {
          throw new SpreadsheetArchivePreflightError("limit");
        }
        if (
          compressedEntryBytes !== undefined
          && declaredEntryBytes > Math.max(1, compressedEntryBytes) * maxCompressionRatio
        ) {
          throw new SpreadsheetArchivePreflightError("limit");
        }
      }

      let entryUncompressedBytes = 0;
      activeFiles.add(file);
      file.ondata = (error, chunk, final) => {
        if (error) {
          throw new SpreadsheetArchivePreflightError("invalid");
        }

        entryUncompressedBytes += chunk.byteLength;
        actualUncompressedBytes += chunk.byteLength;
        if (
          entryUncompressedBytes > maxEntryUncompressedBytes
          || actualUncompressedBytes > maxUncompressedBytes
          || (
            compressedEntryBytes !== undefined
            && entryUncompressedBytes > Math.max(1, compressedEntryBytes) * maxCompressionRatio
          )
        ) {
          throw new SpreadsheetArchivePreflightError("limit");
        }

        if (final) {
          if (
            declaredEntryBytes !== undefined
            && entryUncompressedBytes !== declaredEntryBytes
          ) {
            throw new SpreadsheetArchivePreflightError("invalid");
          }
          activeFiles.delete(file);
          completedEntries += 1;
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);

    for (let offset = 0; offset < buffer.length; offset += ARCHIVE_STREAM_CHUNK_BYTES) {
      const end = Math.min(buffer.length, offset + ARCHIVE_STREAM_CHUNK_BYTES);
      unzip.push(buffer.subarray(offset, end), end === buffer.length);
    }

    if (entryCount === 0 || completedEntries !== entryCount || activeFiles.size > 0) {
      throw new SpreadsheetArchivePreflightError("invalid");
    }

    return {
      success: true,
      entryCount,
      uncompressedBytes: actualUncompressedBytes,
    };
  } catch (error) {
    terminateArchiveFiles(activeFiles);
    if (error instanceof SpreadsheetArchivePreflightError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: SPREADSHEET_ARCHIVE_INVALID_ERROR };
  }
}
