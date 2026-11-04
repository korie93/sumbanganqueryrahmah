import { safeGetStorageItem, safeRemoveStorageItem, safeSetStorageItem } from "@/lib/browser-storage";
import { safeJsonParseResult } from "@/lib/utils/safe-json";
import type { BackupJobRecord } from "./types";

const BACKUP_JOB_STORAGE_KEY = "backup-job-tracking";
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

export type BackupJobRecovery = { scope: string; jobId: string; handled: boolean };
export type BackupJobDisplayState = "checking" | "unknown" | BackupJobRecord["status"];
type BackupJobAccount = { id?: string | undefined; username: string; sessionExpiresAt?: string | null | undefined };

export function buildBackupJobRuntimeScope(account: BackupJobAccount | null, activityId: string): string | null {
  const identity = account?.id?.trim() || account?.username.trim();
  if (!identity) return null;
  return activityId.trim()
    ? JSON.stringify([identity, activityId.trim()])
    : JSON.stringify([identity, "", account?.sessionExpiresAt ?? ""]);
}

export function isCurrentBackupJobSession(capturedScope: string | null, currentScope: string | null): boolean {
  return capturedScope !== null && capturedScope === currentScope;
}

export function createBackupJobRecoveryChannel() {
  let latest: BackupJobRecovery | null = null;
  const listeners = new Set<(recovery: BackupJobRecovery) => void>();
  return {
    read: (scope: string | null) => latest?.scope === scope ? latest : null,
    publish(recovery: BackupJobRecovery) {
      latest = recovery;
      for (const listener of listeners) listener(recovery);
    },
    subscribe(scope: string, listener: (recovery: BackupJobRecovery) => void) {
      const scopedListener = (recovery: BackupJobRecovery) => {
        if (recovery.scope === scope) listener(recovery);
      };
      listeners.add(scopedListener);
      return () => { listeners.delete(scopedListener); };
    },
  };
}

export const backupJobRecoveryChannel = createBackupJobRecoveryChannel();

export function buildBackupJobSessionScope(
  account: BackupJobAccount | null,
  activityId: string,
): string | null {
  const identity = account?.id?.trim() || account?.username.trim();
  return identity && activityId.trim() ? JSON.stringify([identity, activityId.trim()]) : null;
}

export function readBackupJobRecovery(storage: RecoveryStorage, scope: string | null): BackupJobRecovery | null {
  const raw = safeGetStorageItem(storage, BACKUP_JOB_STORAGE_KEY);
  if (!raw) return null;
  const parsed = safeJsonParseResult<unknown>(raw, { maxRawLength: 2048, maxDepth: 2, maxNodes: 8 });
  if (scope && parsed.ok && parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) {
    const value = parsed.data as Record<string, unknown>;
    if (Object.keys(value).length === 3
      && ["scope", "jobId", "handled"].every((key) => Object.prototype.hasOwnProperty.call(value, key))
      && value.scope === scope
      && typeof value.jobId === "string" && value.jobId.trim()
      && typeof value.handled === "boolean") {
      return { scope, jobId: value.jobId.trim(), handled: value.handled };
    }
  }
  safeRemoveStorageItem(storage, BACKUP_JOB_STORAGE_KEY);
  return null;
}

export function persistBackupJobRecovery(storage: RecoveryStorage, recovery: BackupJobRecovery): boolean {
  const saved = safeSetStorageItem(storage, BACKUP_JOB_STORAGE_KEY, JSON.stringify(recovery));
  if (!saved && recovery.handled) safeRemoveStorageItem(storage, BACKUP_JOB_STORAGE_KEY);
  return saved;
}

export function resolveBackupJobDisplayState({
  jobId, job, validated, failed,
}: {
  jobId: string | null;
  job: BackupJobRecord | undefined;
  validated: boolean;
  failed: boolean;
}): BackupJobDisplayState {
  if (!jobId) return "unknown";
  if (!validated) return "checking";
  if (failed || !job || job.id !== jobId) return "unknown";
  return job.status;
}

export function getBackupJobStatusLabel(state: BackupJobDisplayState, type?: BackupJobRecord["type"]): string {
  if (state === "checking") return "Menyemak status kerja";
  if (state === "unknown") return "Status kerja belum disahkan";
  if (state === "queued") return "Kerja dalam giliran";
  if (state === "completed") return "Kerja terakhir selesai";
  if (state === "failed") return "Kerja terakhir gagal";
  return type === "restore" ? "Restore sedang berjalan" : "Backup sedang berjalan";
}
