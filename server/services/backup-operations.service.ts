import type { BackupsRepository } from "../repositories/backups.repository";
import type { PostgresStorage } from "../storage-postgres";

type BackupOperationsStorage = Pick<PostgresStorage, "createAuditLog">;
type BackupOperationsBackupsRepository = Pick<
  BackupsRepository,
  | "createBackup"
  | "deleteBackup"
  | "getBackupById"
  | "getBackupDataForExport"
  | "getBackups"
  | "restoreFromBackup"
>;
type BackupExportData = Awaited<
  ReturnType<BackupOperationsBackupsRepository["getBackupDataForExport"]>
>;
type BackupRecord = NonNullable<
  Awaited<ReturnType<BackupOperationsBackupsRepository["getBackupById"]>>
>;
type BackupListResponse = { backups: Awaited<ReturnType<BackupOperationsBackupsRepository["getBackups"]>> };
type BackupOperationResponse<T> = {
  statusCode: number;
  body: T;
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

export class BackupOperationsService {
  constructor(
    private readonly storage: BackupOperationsStorage,
    private readonly backupsRepository: BackupOperationsBackupsRepository,
    private readonly withExportCircuit: <T>(fn: () => Promise<T>) => Promise<T>,
    private readonly isExportCircuitOpenError: (error: unknown) => boolean,
  ) {}

  async listBackups(): Promise<BackupListResponse> {
    return { backups: await this.backupsRepository.getBackups() };
  }

  async getBackup(backupId: string): Promise<BackupOperationResponse<BackupRecord | { message: string }>> {
    const backup = await this.backupsRepository.getBackupById(backupId);
    if (!backup) {
      return {
        statusCode: 404,
        body: { message: "Backup not found" },
      };
    }

    return {
      statusCode: 200,
      body: backup,
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
        const metadata = this.buildBackupMetadata(backupData);
        const created = await this.backupsRepository.createBackup({
          name: params.name,
          createdBy: params.username,
          backupData: JSON.stringify(backupData),
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
  ): Promise<
    BackupOperationResponse<
      | ({
          backupId: string;
          backupName: string;
          restoredAt: string;
          durationMs: number;
          message: string;
        } & Awaited<ReturnType<BackupOperationsBackupsRepository["restoreFromBackup"]>>)
      | { message: string }
    >
  > {
    let backup;

    try {
      backup = await this.withExportCircuit(() =>
        this.backupsRepository.getBackupById(params.backupId),
      );
    } catch (error) {
      return this.getCircuitOpenResponse(error);
    }

    if (!backup) {
      return {
        statusCode: 404,
        body: { message: "Backup not found" },
      };
    }

    let result;

    try {
      result = await this.withExportCircuit(async () => {
        const startTime = Date.now();
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
            durationMs: Date.now() - startTime,
          }),
        });

        return { restored, startTime };
      });
    } catch (error) {
      return this.getCircuitOpenResponse(error);
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
        message: `Restore completed in ${Math.round(durationMs / 1000)}s.`,
      },
    };
  }

  async deleteBackup(
    params: DeleteBackupInput,
  ): Promise<BackupOperationResponse<{ success: boolean } | { message: string }>> {
    let backup;
    let deleted;

    try {
      backup = await this.withExportCircuit(() =>
        this.backupsRepository.getBackupById(params.backupId),
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
      targetResource: backup?.name || params.backupId,
    });

    return {
      statusCode: 200,
      body: { success: true },
    };
  }

  private buildBackupMetadata(backupData: BackupExportData) {
    return {
      timestamp: new Date().toISOString(),
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

  private getCircuitOpenResponse<T>(error: unknown): BackupOperationResponse<T | { message: string }> {
    if (this.isExportCircuitOpenError(error)) {
      return {
        statusCode: 503,
        body: { message: "Export circuit is OPEN. Retry later." },
      };
    }

    throw error;
  }
}
