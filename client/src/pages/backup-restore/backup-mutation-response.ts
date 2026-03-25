import type {
  BackupJobRecord,
  RestoreResponse,
} from "@/pages/backup-restore/types";

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null;
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeOptionalNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function isRestoreResponse(value: unknown): value is RestoreResponse {
  if (!isRecord(value) || typeof value.success !== "boolean" || !isRecord(value.stats)) {
    return false;
  }

  return typeof value.message === "string";
}

function normalizeBackupJobRecord(
  value: unknown,
  options?: { allowMinimalShape?: boolean },
): BackupJobRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeOptionalText(value.id);
  if (!id) {
    return null;
  }

  const hasExplicitJobShape =
    value.status != null
    || value.type != null
    || value.requestedAt != null
    || value.requested_at != null
    || value.requestedBy != null
    || value.requested_by != null;

  if (!options?.allowMinimalShape && !hasExplicitJobShape) {
    return null;
  }

  return {
    id,
    type: String(value.type ?? "create") as BackupJobRecord["type"],
    status: String(value.status ?? "queued") as BackupJobRecord["status"],
    requestedBy: String(value.requestedBy ?? value.requested_by ?? "system"),
    requestedAt: String(value.requestedAt ?? value.requested_at ?? new Date().toISOString()),
    startedAt: normalizeOptionalText(value.startedAt ?? value.started_at),
    finishedAt: normalizeOptionalText(value.finishedAt ?? value.finished_at),
    backupId: normalizeOptionalText(value.backupId ?? value.backup_id),
    backupName: normalizeOptionalText(value.backupName ?? value.backup_name),
    queuePosition: normalizeOptionalNumber(value.queuePosition ?? value.queue_position),
    result: value.result ?? null,
    error: isRecord(value.error)
      ? {
          message: String(value.error.message ?? ""),
          statusCode: Number(value.error.statusCode ?? value.error.status_code ?? 500),
        }
      : null,
  };
}

export type ResolvedBackupMutationResponse =
  | {
      mode: "queued";
      message: string;
      job: BackupJobRecord;
    }
  | {
      mode: "completed";
      message: string;
      backupId: string | null;
      backupName: string | null;
      restoreResult: RestoreResponse | null;
    };

export function resolveBackupMutationResponse(
  raw: unknown,
  fallbackMessage: string,
): ResolvedBackupMutationResponse {
  const record = isRecord(raw) ? raw : {};
  const message = String(record.message ?? fallbackMessage).trim() || fallbackMessage;

  const nestedJob = normalizeBackupJobRecord(record.job, { allowMinimalShape: true });
  if (nestedJob) {
    return {
      mode: "queued",
      message,
      job: nestedJob,
    };
  }

  const directJob = normalizeBackupJobRecord(raw);
  if (directJob) {
    return {
      mode: "queued",
      message,
      job: directJob,
    };
  }

  if (isRestoreResponse(raw)) {
    const restoreResult = raw;
    return {
      mode: "completed",
      message,
      backupId: normalizeOptionalText(record.backupId ?? record.backup_id),
      backupName: normalizeOptionalText(record.backupName ?? record.backup_name),
      restoreResult,
    };
  }

  const backupId = normalizeOptionalText(record.id ?? record.backupId ?? record.backup_id);
  const backupName = normalizeOptionalText(record.name ?? record.backupName ?? record.backup_name);
  if (backupId || backupName) {
    return {
      mode: "completed",
      message,
      backupId,
      backupName,
      restoreResult: null,
    };
  }

  throw new Error("Backup response did not include queued job details or completion details.");
}
