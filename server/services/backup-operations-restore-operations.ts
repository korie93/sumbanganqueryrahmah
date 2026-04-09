import { readStoredPayloadBytes, verifyBackupIntegrityFromChunks } from "./backup-operations-integrity-utils";
import { logger } from "../lib/logger";
import type {
  BackupIntegrityResult,
  BackupMetadataRecord,
  BackupOperationResponse,
  RestoreBackupInput,
  RestoreBackupSuccessBody,
  RestoreFromBackupResult,
} from "./backup-operations-types";
import {
  buildBackupPayloadTooLargeMessage,
  getBackupPayloadReadFailure,
  type BackupOperationsLimits,
  getCircuitOpenResponse,
} from "./backup-operations-service-shared";
import type { BackupOperationsMutationDeps } from "./backup-operations-mutation-shared";

export async function executeRestoreBackup(
  deps: BackupOperationsMutationDeps,
  params: RestoreBackupInput,
  limits: BackupOperationsLimits,
): Promise<BackupOperationResponse<RestoreBackupSuccessBody | { message: string }>> {
  let backup: BackupMetadataRecord | undefined;

  try {
    backup = await deps.withExportCircuit(() =>
      deps.backupsRepository.getBackupMetadataById(params.backupId),
    );
  } catch (error) {
    const payloadReadFailure = getBackupPayloadReadFailure<RestoreBackupSuccessBody>(error);
    if (payloadReadFailure) {
      return payloadReadFailure;
    }
    return getCircuitOpenResponse(error, deps.isExportCircuitOpenError);
  }

  if (!backup) {
    return {
      statusCode: 404,
      body: { message: "Backup not found" },
    };
  }

  const storedPayloadBytes = readStoredPayloadBytes(backup);
  if (
    typeof storedPayloadBytes === "number"
    && storedPayloadBytes > limits.maxPayloadBytes
  ) {
    logger.warn("Backup restore blocked by metadata payload size preflight", {
      backupId: backup.id,
      backupName: backup.name,
      username: params.username,
      payloadBytes: storedPayloadBytes,
      maxPayloadBytes: limits.maxPayloadBytes,
    });
    return {
      statusCode: 413,
      body: { message: buildBackupPayloadTooLargeMessage(limits.maxPayloadBytes) },
    };
  }

  let result:
    | {
        error: {
          statusCode: number;
          message: string;
      };
    }
    | {
        restored: RestoreFromBackupResult;
        startTime: number;
        integrity: BackupIntegrityResult;
      };

  try {
    result = await deps.withExportCircuit(async () => {
      const startTime = Date.now();
      const createBackupDataJsonChunks = async () => {
        const chunks = await deps.backupsRepository.iterateBackupDataJsonChunksById(params.backupId);
        if (!chunks) {
          throw new Error("Backup payload is not readable.");
        }
        return chunks;
      };
      const integrity = await verifyBackupIntegrityFromChunks(
        backup,
        await createBackupDataJsonChunks(),
      );
      if (integrity.payloadBytes > limits.maxPayloadBytes) {
        logger.warn("Backup restore blocked because the payload exceeds the configured size limit", {
          backupId: backup.id,
          backupName: backup.name,
          username: params.username,
          payloadBytes: integrity.payloadBytes,
          maxPayloadBytes: limits.maxPayloadBytes,
        });
        return {
          error: {
            statusCode: 413,
            message: buildBackupPayloadTooLargeMessage(limits.maxPayloadBytes),
          },
        };
      }
      if (!integrity.ok) {
        return {
          error: {
            statusCode: 409,
            message: "Backup integrity check failed. Restore cancelled.",
          },
        };
      }

      const restored = await deps.backupsRepository.restoreFromBackup(
        await createBackupDataJsonChunks(),
      );

      await deps.storage.createAuditLog({
        action: "RESTORE_BACKUP",
        performedBy: params.username,
        targetResource: backup.name,
        details: JSON.stringify({
          totalProcessed: restored.stats.totalProcessed,
          totalInserted: restored.stats.totalInserted,
          totalSkipped: restored.stats.totalSkipped,
          totalReactivated: restored.stats.totalReactivated,
          warningCount: restored.stats.warnings.length,
          integrityVerified: integrity.verified,
          durationMs: Date.now() - startTime,
        }),
      });

      return { restored, startTime, integrity };
    });
  } catch (error) {
    const payloadReadFailure = getBackupPayloadReadFailure<RestoreBackupSuccessBody>(error);
    if (payloadReadFailure) {
      return payloadReadFailure;
    }
    return getCircuitOpenResponse(error, deps.isExportCircuitOpenError);
  }

  if ("error" in result) {
    return {
      statusCode: result.error.statusCode,
      body: { message: result.error.message },
    };
  }

  const durationMs = Date.now() - result.startTime;

  return {
    statusCode: 200,
    body: {
      ...result.restored,
      backupId: backup.id,
      backupName: backup.name,
      restoredAt: new Date().toISOString(),
      durationMs,
      integrity: {
        checksumSha256: result.integrity.storedChecksum || result.integrity.computedChecksum,
        verified: result.integrity.verified,
      },
      message: `Restore completed in ${Math.round(durationMs / 1000)}s.`,
    },
  };
}
