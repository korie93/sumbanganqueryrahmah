import { promises as fs } from "node:fs";
import { readDate, readInteger, readOptionalString } from "../http/validation";
import { logger } from "../lib/logger";
import {
  buildBackupExportEnvelope,
  buildBackupMetadata,
  createBackupDownloadFileName,
  getBackupPayloadReadErrorResponse,
  type BackupErrorBody,
  type BackupIntegrityResult,
  type BackupListResponse,
  type BackupMetadataRecord,
  type BackupOperationResponse,
  type BackupOperationsBackupsRepository,
  type BackupOperationsStorage,
  type CreateBackupInput,
  type DeleteBackupInput,
  type ListBackupsInput,
  type PreparedBackupPayloadFile,
  type RestoreBackupInput,
  type RestoreBackupSuccessBody,
  type RestoreFromBackupResult,
  verifyBackupIntegrity,
} from "./backup-operations-utils";

export class BackupOperationsService {
  constructor(
    private readonly storage: BackupOperationsStorage,
    private readonly backupsRepository: BackupOperationsBackupsRepository,
    private readonly withExportCircuit: <T>(fn: () => Promise<T>) => Promise<T>,
    private readonly isExportCircuitOpenError: (error: unknown) => boolean,
  ) {}

  async listBackups(query: ListBackupsInput): Promise<BackupListResponse> {
    const page = Math.max(1, readInteger(query.page, 1));
    const pageSize = Math.max(1, Math.min(100, readInteger(query.pageSize, 25)));
    const searchName = readOptionalString(query.searchName ?? query.search);
    const createdBy = readOptionalString(query.createdBy);
    const dateFrom = readDate(query.dateFrom);
    const dateTo = readDate(query.dateTo);
    const sortBy = String(readOptionalString(query.sortBy) || "newest").toLowerCase();

    const result = await this.backupsRepository.listBackupsPage({
      page,
      pageSize,
      searchName,
      createdBy,
      dateFrom,
      dateTo,
      sortBy:
        sortBy === "oldest" || sortBy === "name-asc" || sortBy === "name-desc"
          ? sortBy
          : "newest",
    });

    return {
      backups: result.backups,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  async getBackupMetadata(
    backupId: string,
    username: string,
  ): Promise<BackupOperationResponse<BackupMetadataRecord | { message: string }>> {
    const backup = await this.backupsRepository.getBackupMetadataById(backupId);
    if (!backup) {
      return {
        statusCode: 404,
        body: { message: "Backup not found" },
      };
    }

    await this.storage.createAuditLog({
      action: "VIEW_BACKUP_METADATA",
      performedBy: username,
      targetResource: backup.name,
      details: JSON.stringify({ backupId: backup.id }),
    });

    return {
      statusCode: 200,
      body: backup,
    };
  }

  async exportBackup(
    backupId: string,
    username: string,
  ): Promise<
    BackupOperationResponse<
      | {
          fileName: string;
          payloadPrefixJson: string;
          backupDataJson: string;
          payloadSuffixJson: string;
        }
      | { message: string }
    >
  > {
    let backup: Awaited<ReturnType<BackupOperationsBackupsRepository["getBackupById"]>>;
    try {
      backup = await this.backupsRepository.getBackupById(backupId);
    } catch (error) {
      const payloadReadFailure = getBackupPayloadReadErrorResponse(error);
      if (payloadReadFailure) {
        return payloadReadFailure;
      }
      throw error;
    }

    if (!backup) {
      return {
        statusCode: 404,
        body: { message: "Backup not found" },
      };
    }

    const backupDataJson = String(backup.backupData || "").trim();
    if (!backupDataJson) {
      return {
        statusCode: 500,
        body: { message: "Backup payload is not readable." },
      };
    }

    const integrity = verifyBackupIntegrity(backup);
    if (!integrity.ok) {
      logger.warn("Backup integrity mismatch detected during export", {
        backupId: backup.id,
        backupName: backup.name,
        username,
        storedChecksum: integrity.storedChecksum,
        computedChecksum: integrity.computedChecksum,
      });
      return {
        statusCode: 409,
        body: { message: "Backup integrity check failed. Export cancelled." },
      };
    }

    const envelopeJson = JSON.stringify(buildBackupExportEnvelope(backup, integrity));

    await this.storage.createAuditLog({
      action: "DOWNLOAD_BACKUP_EXPORT",
      performedBy: username,
      targetResource: backup.name,
      details: JSON.stringify({
        backupId: backup.id,
        integrityVerified: integrity.verified,
      }),
    });
    logger.warn("Backup export downloaded", {
      backupId: backup.id,
      backupName: backup.name,
      username,
      integrityVerified: integrity.verified,
    });

    return {
      statusCode: 200,
      body: {
        fileName: createBackupDownloadFileName(backup.name, backup.id),
        payloadPrefixJson: `${envelopeJson.slice(0, -1)},"backupData":`,
        backupDataJson,
        payloadSuffixJson: "}",
      },
    };
  }

  async createBackup(
    params: CreateBackupInput,
  ): Promise<BackupOperationResponse<Awaited<ReturnType<BackupOperationsBackupsRepository["createBackup"]>> | { message: string }>> {
    let backup;
    let preparedBackupPayload: PreparedBackupPayloadFile | null = null;

    try {
      backup = await this.withExportCircuit(async () => {
        const startTime = Date.now();
        preparedBackupPayload = await this.backupsRepository.prepareBackupPayloadFileForCreate();

        try {
          const backupPayloadJson = await fs.readFile(preparedBackupPayload.tempFilePath, "utf8");
          const metadata = buildBackupMetadata(
            preparedBackupPayload,
            preparedBackupPayload.payloadChecksumSha256,
          );
          const created = await this.backupsRepository.createBackup({
            name: params.name,
            createdBy: params.username,
            backupData: backupPayloadJson,
            metadata: JSON.stringify(metadata),
          });

          await this.storage.createAuditLog({
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
      return this.getCircuitOpenResponse(error);
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
      backup = await this.withExportCircuit(() =>
        this.backupsRepository.getBackupById(params.backupId),
      );
    } catch (error) {
      const payloadReadFailure = this.getBackupPayloadReadErrorResponse(error);
      if (payloadReadFailure) {
        return payloadReadFailure;
      }
      return this.getCircuitOpenResponse(error);
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
      result = await this.withExportCircuit(async () => {
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
        const restored = await this.backupsRepository.restoreFromBackup(backupDataJson);

        await this.storage.createAuditLog({
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
      return this.getCircuitOpenResponse(error);
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
      backupMetadata = await this.withExportCircuit(() =>
        this.backupsRepository.getBackupMetadataById(params.backupId),
      );
      deleted = await this.withExportCircuit(() =>
        this.backupsRepository.deleteBackup(params.backupId),
      );
    } catch (error) {
      return this.getCircuitOpenResponse(error);
    }

    if (!deleted) {
      return {
        statusCode: 404,
        body: { message: "Backup not found" },
      };
    }

    await this.storage.createAuditLog({
      action: "DELETE_BACKUP",
      performedBy: params.username,
      targetResource: backupMetadata?.name || params.backupId,
    });

    return {
      statusCode: 200,
      body: { success: true },
    };
  }

  private getCircuitOpenResponse<T>(error: unknown): BackupOperationResponse<T | { message: string }> {
    if (this.isExportCircuitOpenError(error)) {
      return {
        statusCode: 503,
        body: { message: "Export circuit is OPEN. Retry later." },
      };
    }

    throw error;
  }

  private getBackupPayloadReadErrorResponse(
    error: unknown,
  ): BackupOperationResponse<{ message: string }> | null {
    return getBackupPayloadReadErrorResponse(error);
  }
}
