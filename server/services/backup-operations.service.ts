import crypto from "crypto";
import { readDate, readInteger, readOptionalString } from "../http/validation";
import { logger } from "../lib/logger";
import type { BackupsRepository } from "../repositories/backups.repository";
import type { PostgresStorage } from "../storage-postgres";

type BackupOperationsStorage = Pick<PostgresStorage, "createAuditLog">;
type BackupOperationsBackupsRepository = Pick<
  BackupsRepository,
  | "createBackup"
  | "deleteBackup"
  | "getBackupMetadataById"
  | "getBackupById"
  | "getBackupDataForExport"
  | "listBackupsPage"
  | "restoreFromBackup"
>;
type BackupExportData = Awaited<
  ReturnType<BackupOperationsBackupsRepository["getBackupDataForExport"]>
>;
type BackupRecord = NonNullable<
  Awaited<ReturnType<BackupOperationsBackupsRepository["getBackupById"]>>
>;
type BackupMetadataRecord = NonNullable<
  Awaited<ReturnType<BackupOperationsBackupsRepository["getBackupMetadataById"]>>
>;
type BackupListPage = Awaited<ReturnType<BackupOperationsBackupsRepository["listBackupsPage"]>>;
type RestoreFromBackupResult = Awaited<
  ReturnType<BackupOperationsBackupsRepository["restoreFromBackup"]>
>;
type BackupListResponse = {
  backups: BackupListPage["backups"];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
type BackupOperationResponse<T> = {
  statusCode: number;
  body: T;
};

type RestoreBackupSuccessBody = {
  backupId: string;
  backupName: string;
  restoredAt: string;
  durationMs: number;
  integrity: {
    checksumSha256: string;
    verified: boolean;
  };
  message: string;
} & RestoreFromBackupResult;

type BackupIntegrityResult = {
  ok: boolean;
  verified: boolean;
  storedChecksum: string | null;
  computedChecksum: string;
};

type CreateBackupInput = {
  name: string;
  username: string;
};

type RestoreBackupInput = {
  backupId: string;
  username: string;
};

type DeleteBackupInput = {
  backupId: string;
  username: string;
};

type ListBackupsInput = Record<string, unknown>;

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
  ): Promise<BackupOperationResponse<{ fileName: string; payloadJson: string } | { message: string }>> {
    let backup: Awaited<ReturnType<BackupOperationsBackupsRepository["getBackupById"]>>;
    try {
      backup = await this.backupsRepository.getBackupById(backupId);
    } catch (error) {
      const payloadReadFailure = this.getBackupPayloadReadErrorResponse(error);
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

    let parsedBackupData: unknown;
    try {
      parsedBackupData = JSON.parse(String(backup.backupData || "{}"));
    } catch {
      return {
        statusCode: 500,
        body: { message: "Backup payload is not readable." },
      };
    }

    const integrity = this.verifyBackupIntegrity(backup);
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

    const exportPayload = {
      id: backup.id,
      name: backup.name,
      createdAt: backup.createdAt,
      createdBy: backup.createdBy,
      metadata: backup.metadata ?? null,
      integrity: {
        checksumSha256: integrity.storedChecksum || integrity.computedChecksum,
        verified: integrity.verified,
      },
      backupData: parsedBackupData,
    };

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

    const safeNameStem = String(backup.name || "backup")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80) || "backup";
    return {
      statusCode: 200,
      body: {
        fileName: `${safeNameStem}-${backup.id}.json`,
        payloadJson: JSON.stringify(exportPayload),
      },
    };
  }

  async createBackup(
    params: CreateBackupInput,
  ): Promise<BackupOperationResponse<Awaited<ReturnType<BackupOperationsBackupsRepository["createBackup"]>> | { message: string }>> {
    let backup;

    try {
      backup = await this.withExportCircuit(async () => {
        const startTime = Date.now();
        const backupData = await this.backupsRepository.getBackupDataForExport();
        const backupPayloadJson = JSON.stringify(backupData);
        const payloadChecksumSha256 = this.computePayloadChecksum(backupPayloadJson);
        const metadata = this.buildBackupMetadata(backupData, payloadChecksumSha256);
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
        const integrity = this.verifyBackupIntegrity(backup);
        if (!integrity.ok) {
          return {
            error: {
              statusCode: 409,
              message: "Backup integrity check failed. Restore cancelled.",
            },
          };
        }

        const backupData = JSON.parse(backup.backupData);
        const restored = await this.backupsRepository.restoreFromBackup(backupData);

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
  ): Promise<BackupOperationResponse<{ success: boolean } | { message: string }>> {
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

  private buildBackupMetadata(backupData: BackupExportData, payloadChecksumSha256: string) {
    return {
      timestamp: new Date().toISOString(),
      schemaVersion: 1,
      payloadChecksumSha256,
      importsCount: backupData.imports.length,
      dataRowsCount: backupData.dataRows.length,
      usersCount: backupData.users.length,
      auditLogsCount: backupData.auditLogs.length,
      collectionRecordsCount: Array.isArray(backupData.collectionRecords)
        ? backupData.collectionRecords.length
        : 0,
      collectionRecordReceiptsCount: Array.isArray(backupData.collectionRecordReceipts)
        ? backupData.collectionRecordReceipts.length
        : 0,
    };
  }

  private computePayloadChecksum(payloadJson: string): string {
    return crypto.createHash("sha256").update(String(payloadJson || ""), "utf8").digest("hex");
  }

  private readStoredChecksum(backup: BackupRecord): string | null {
    const metadata = backup.metadata;
    if (!metadata || typeof metadata !== "object") {
      return null;
    }
    const candidate = String((metadata as Record<string, unknown>).payloadChecksumSha256 || "")
      .trim()
      .toLowerCase();
    return /^[a-f0-9]{64}$/.test(candidate) ? candidate : null;
  }

  private verifyBackupIntegrity(backup: BackupRecord): BackupIntegrityResult {
    const computedChecksum = this.computePayloadChecksum(String(backup.backupData || ""));
    const storedChecksum = this.readStoredChecksum(backup);
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
}
