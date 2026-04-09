export type BackupMetadataRecord = Record<string, unknown>;

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
  if (trimmed.length > 200_000) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return isBackupMetadataRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
