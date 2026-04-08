import crypto from "crypto";
import type {
  BackupErrorBody,
  BackupIntegrityResult,
  BackupMetadataRecord,
  BackupOperationResponse,
  BackupRecord,
  PreparedBackupPayloadFile,
} from "./backup-operations-types";

export function buildBackupMetadata(
  backupData: Pick<PreparedBackupPayloadFile, "counts" | "payloadBytes" | "tempPayloadEncrypted">,
  payloadChecksumSha256: string,
) {
  const counts = backupData.counts;

  return {
    timestamp: new Date().toISOString(),
    schemaVersion: 1,
    payloadChecksumSha256,
    importsCount: counts.importsCount,
    dataRowsCount: counts.dataRowsCount,
    usersCount: counts.usersCount,
    auditLogsCount: counts.auditLogsCount,
    collectionRecordsCount: counts.collectionRecordsCount,
    collectionRecordReceiptsCount: counts.collectionRecordReceiptsCount,
    payloadBytes: backupData.payloadBytes,
    tempPayloadEncrypted: backupData.tempPayloadEncrypted,
  };
}

export function computePayloadChecksum(payloadJson: string): string {
  return crypto.createHash("sha256").update(String(payloadJson || ""), "utf8").digest("hex");
}

export function readStoredChecksum(backup: BackupRecord): string | null {
  const metadata = backup.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const candidate = String((metadata as Record<string, unknown>).payloadChecksumSha256 || "")
    .trim()
    .toLowerCase();
  return /^[a-f0-9]{64}$/.test(candidate) ? candidate : null;
}

export function verifyBackupIntegrity(backup: BackupRecord): BackupIntegrityResult {
  const computedChecksum = computePayloadChecksum(String(backup.backupData || ""));
  const storedChecksum = readStoredChecksum(backup);
  if (!storedChecksum) {
    return {
      ok: true,
      verified: false,
      storedChecksum: null,
      computedChecksum,
    };
  }

  return {
    ok: storedChecksum === computedChecksum,
    verified: true,
    storedChecksum,
    computedChecksum,
  };
}

export function buildBackupExportEnvelope(
  backup: BackupRecord,
  integrity: BackupIntegrityResult,
) {
  return {
    id: backup.id,
    name: backup.name,
    createdAt: backup.createdAt,
    createdBy: backup.createdBy,
    metadata: backup.metadata ?? null,
    integrity: {
      checksumSha256: integrity.storedChecksum || integrity.computedChecksum,
      verified: integrity.verified,
    },
  };
}

export function createBackupDownloadFileName(name: string, backupId: string): string {
  const safeNameStem = String(name || "backup")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80) || "backup";
  return `${safeNameStem}-${backupId}.json`;
}

export function getBackupPayloadReadErrorResponse(
  error: unknown,
): BackupOperationResponse<BackupErrorBody> | null {
  const message = String((error as { message?: string })?.message || "");
  if (
    /decrypt|encryption key|encrypted format|backup payload|BACKUP_ENCRYPTION_KEY/i.test(
      message,
    )
  ) {
    return {
      statusCode: 409,
      body: {
        message:
          "Backup payload cannot be decrypted with the current encryption configuration.",
      },
    };
  }
  return null;
}

export type { BackupMetadataRecord };
