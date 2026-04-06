import { verifyBackupIntegrity } from "./backup-operations-integrity-utils";
import type {
  BackupIntegrityResult,
  BackupOperationResponse,
  RestoreBackupInput,
  RestoreBackupSuccessBody,
  RestoreFromBackupResult,
} from "./backup-operations-types";
import {
  getBackupPayloadReadFailure,
  getCircuitOpenResponse,
} from "./backup-operations-service-shared";
import type { BackupOperationsMutationDeps } from "./backup-operations-mutation-shared";

export async function executeRestoreBackup(
  deps: BackupOperationsMutationDeps,
  params: RestoreBackupInput,
): Promise<BackupOperationResponse<RestoreBackupSuccessBody | { message: string }>> {
  let backup;

  try {
    backup = await deps.withExportCircuit(() =>
      deps.backupsRepository.getBackupById(params.backupId),
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
      const integrity = verifyBackupIntegrity(backup);
      if (!integrity.ok) {
        return {
          error: {
            statusCode: 409,
            message: "Backup integrity check failed. Restore cancelled.",
          },
        };
      }

      const backupDataJson = String(backup.backupData || "");
      backup.backupData = "";
      const restored = await deps.backupsRepository.restoreFromBackup(backupDataJson);

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
