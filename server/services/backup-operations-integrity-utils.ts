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
  backupData: Pick<
    PreparedBackupPayloadFile,
    | "counts"
    | "payloadBytes"
    | "maxSerializedRowBytes"
    | "memoryRssBytes"
    | "memoryHeapUsedBytes"
    | "tempPayloadEncrypted"
  >,
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
    ...(typeof backupData.maxSerializedRowBytes === "number"
      ? { maxSerializedRowBytes: backupData.maxSerializedRowBytes }
      : {}),
    ...(typeof backupData.memoryRssBytes === "number"
      ? { memoryRssBytes: backupData.memoryRssBytes }
      : {}),
    ...(typeof backupData.memoryHeapUsedBytes === "number"
      ? { memoryHeapUsedBytes: backupData.memoryHeapUsedBytes }
      : {}),
    tempPayloadEncrypted: backupData.tempPayloadEncrypted,
  };
}

export function computePayloadChecksum(payloadJson: string): string {
  return crypto.createHash("sha256").update(String(payloadJson || ""), "utf8").digest("hex");
}

export function readStoredChecksum(
  backup: { metadata: unknown },
): string | null {
  const metadata = backup.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const candidate = String((metadata as Record<string, unknown>).payloadChecksumSha256 || "")
    .trim()
    .toLowerCase();
  return /^[a-f0-9]{64}$/.test(candidate) ? candidate : null;
}

export function readStoredPayloadBytes(
  backup: { metadata: unknown },
): number | null {
  const metadata = backup.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const candidate = (metadata as Record<string, unknown>).payloadBytes;
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return null;
  }

  const normalized = Math.trunc(candidate);
  return normalized >= 0 ? normalized : null;
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

export async function verifyBackupIntegrityFromChunks(
  backup: { metadata: unknown },
  chunks: AsyncIterable<string>,
): Promise<BackupIntegrityResult & { payloadBytes: number }> {
  const hash = crypto.createHash("sha256");
  let payloadBytes = 0;

  for await (const chunk of chunks) {
    if (!chunk) {
      continue;
    }
    hash.update(chunk, "utf8");
    payloadBytes += Buffer.byteLength(chunk, "utf8");
  }

  const computedChecksum = hash.digest("hex");
  const storedChecksum = readStoredChecksum(backup);
  if (!storedChecksum) {
    return {
      ok: true,
      verified: false,
      storedChecksum: null,
      computedChecksum,
      payloadBytes,
    };
  }

  return {
    ok: storedChecksum === computedChecksum,
    verified: true,
    storedChecksum,
    computedChecksum,
    payloadBytes,
  };
}

export function buildBackupExportEnvelope(
  backup: Pick<BackupMetadataRecord, "id" | "name" | "createdAt" | "createdBy" | "metadata">,
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
