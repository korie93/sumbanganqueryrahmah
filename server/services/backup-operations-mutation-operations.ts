import { promises as fs } from "node:fs";
import {
  buildBackupMetadata,
  verifyBackupIntegrity,
} from "./backup-operations-integrity-utils";
import {
  type BackupErrorBody,
  type BackupIntegrityResult,
  type BackupOperationResponse,
  type CreateBackupInput,
  type DeleteBackupInput,
  type PreparedBackupPayloadFile,
  type RestoreBackupInput,
  type RestoreBackupSuccessBody,
  type RestoreFromBackupResult,
} from "./backup-operations-types";
import {
  type BackupOperationsServiceDeps,
  getBackupPayloadReadFailure,
  getCircuitOpenResponse,
} from "./backup-operations-service-shared";

export class BackupOperationsMutationOperations {
  constructor(
    private readonly deps: Pick<
      BackupOperationsServiceDeps,
      "storage" | "backupsRepository" | "withExportCircuit" | "isExportCircuitOpenError"
    >,
  ) {}

  async createBackup(
    params: CreateBackupInput,
  ): Promise<
    BackupOperationResponse<
      Awaited<ReturnType<BackupOperationsServiceDeps["backupsRepository"]["createBackup"]>> | { message: string }
    >
  > {
    let backup;
    let preparedBackupPayload: PreparedBackupPayloadFile | null = null;

    try {
      backup = await this.deps.withExportCircuit(async () => {
        const startTime = Date.now();
        preparedBackupPayload = await this.deps.backupsRepository.prepareBackupPayloadFileForCreate();

        try {
          const backupPayloadJson = await fs.readFile(preparedBackupPayload.tempFilePath, "utf8");
          const metadata = buildBackupMetadata(
            preparedBackupPayload,
            preparedBackupPayload.payloadChecksumSha256,
          );
          const created = await this.deps.backupsRepository.createBackup({
            name: params.name,
            createdBy: params.username,
            backupData: backupPayloadJson,
            metadata: JSON.stringify(metadata),
          });

          await this.deps.storage.createAuditLog({
            action: "CREATE_BACKUP",
            performedBy: params.username,
            targetResource: params.name,
            details: JSON.stringify({
              ...metadata,
              durationMs: Date.now() - startTime,
            }),
          });

          return created;
        } finally {
          await preparedBackupPayload?.cleanup();
          preparedBackupPayload = null;
        }
      });
    } catch (error) {
      return getCircuitOpenResponse(error, this.deps.isExportCircuitOpenError);
    }

    return {
      statusCode: 200,
      body: backup,
    };
  }

  async restoreBackup(
    params: RestoreBackupInput,
  ): Promise<BackupOperationResponse<RestoreBackupSuccessBody | { message: string }>> {
    let backup;

    try {
      backup = await this.deps.withExportCircuit(() =>
        this.deps.backupsRepository.getBackupById(params.backupId),
      );
    } catch (error) {
      const payloadReadFailure = getBackupPayloadReadFailure<RestoreBackupSuccessBody>(error);
      if (payloadReadFailure) {
        return payloadReadFailure;
      }
      return getCircuitOpenResponse(error, this.deps.isExportCircuitOpenError);
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
      result = await this.deps.withExportCircuit(async () => {
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
        const restored = await this.deps.backupsRepository.restoreFromBackup(backupDataJson);

        await this.deps.storage.createAuditLog({
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
      return getCircuitOpenResponse(error, this.deps.isExportCircuitOpenError);
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

  async deleteBackup(
    params: DeleteBackupInput,
  ): Promise<BackupOperationResponse<{ success: boolean } | BackupErrorBody>> {
    let backupMetadata;
    let deleted;

    try {
      backupMetadata = await this.deps.withExportCircuit(() =>
        this.deps.backupsRepository.getBackupMetadataById(params.backupId),
      );
      deleted = await this.deps.withExportCircuit(() =>
        this.deps.backupsRepository.deleteBackup(params.backupId),
      );
    } catch (error) {
      return getCircuitOpenResponse(error, this.deps.isExportCircuitOpenError);
    }

    if (!deleted) {
      return {
        statusCode: 404,
        body: { message: "Backup not found" },
      };
    }

    await this.deps.storage.createAuditLog({
      action: "DELETE_BACKUP",
      performedBy: params.username,
      targetResource: backupMetadata?.name || params.backupId,
    });

    return {
      statusCode: 200,
      body: { success: true },
    };
  }
}
