import { logger } from "../lib/logger";
import { safeJsonParse } from "../lib/safe-json";

export type BackupMetadataRecord = Record<string, unknown>;

const MAX_BACKUP_METADATA_PARSE_WARNINGS = 3;
const MAX_BACKUP_METADATA_BYTES = 200_000;
let backupMetadataParseWarningCount = 0;

function summarizeBackupMetadataParseError(error: unknown): Record<string, unknown> | undefined {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (typeof error === "string") {
    return { type: "string" };
  }

  return undefined;
}

function isBackupMetadataRecord(value: unknown): value is BackupMetadataRecord {
  return typeof value === "object" && value !== null;
}

export function parseBackupMetadataSafe(raw: unknown): BackupMetadataRecord | null {
  if (!raw) return null;
  if (isBackupMetadataRecord(raw)) return raw;
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Guard against pathological legacy rows that can break JSON parsing/allocation.
  if (Buffer.byteLength(trimmed, "utf8") > MAX_BACKUP_METADATA_BYTES) return null;

  try {
    const parseResult = safeJsonParse<unknown>(
      trimmed,
      "backup_metadata",
      {
        maxDepth: 8,
        maxObjectKeys: 200,
        maxRawBytes: MAX_BACKUP_METADATA_BYTES,
        maxStringLength: 20_000,
        maxTotalBytes: MAX_BACKUP_METADATA_BYTES,
      },
    );
    if (!parseResult.success) {
      return null;
    }
    const parsed = parseResult.data;
    return isBackupMetadataRecord(parsed) ? parsed : null;
  } catch (error) {
    if (backupMetadataParseWarningCount < MAX_BACKUP_METADATA_PARSE_WARNINGS) {
      backupMetadataParseWarningCount += 1;
      logger.warn("Failed to parse backup metadata JSON", {
        operation: "parseBackupMetadataSafe",
        metadataLength: trimmed.length,
        suppressedAfter: MAX_BACKUP_METADATA_PARSE_WARNINGS,
        error: summarizeBackupMetadataParseError(error),
      });
    }
    return null;
  }
}
