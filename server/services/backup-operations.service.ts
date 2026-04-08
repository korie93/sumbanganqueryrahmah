import {
  type BackupOperationResponse,
  type BackupOperationsBackupsRepository,
  type BackupOperationsStorage,
  type CreateBackupInput,
  type DeleteBackupInput,
  type ListBackupsInput,
  type RestoreBackupInput,
} from "./backup-operations-types";
import { BackupOperationsMutationOperations } from "./backup-operations-mutation-operations";
import { BackupOperationsReadOperations } from "./backup-operations-read-operations";
import {
  DEFAULT_BACKUP_MAX_PAYLOAD_BYTES,
  type BackupOperationsLimits,
} from "./backup-operations-service-shared";

export class BackupOperationsService {
  private readonly readOperations: BackupOperationsReadOperations;
  private readonly mutationOperations: BackupOperationsMutationOperations;

  constructor(
    storage: BackupOperationsStorage,
    backupsRepository: BackupOperationsBackupsRepository,
    withExportCircuit: <T>(fn: () => Promise<T>) => Promise<T>,
    isExportCircuitOpenError: (error: unknown) => boolean,
    options?: Partial<BackupOperationsLimits>,
  ) {
    const limits: BackupOperationsLimits = {
      maxPayloadBytes:
        options?.maxPayloadBytes == null
          ? DEFAULT_BACKUP_MAX_PAYLOAD_BYTES
          : Math.max(1, Math.trunc(options.maxPayloadBytes)),
    };
    this.readOperations = new BackupOperationsReadOperations(storage, backupsRepository, limits);
    this.mutationOperations = new BackupOperationsMutationOperations({
      storage,
      backupsRepository,
      withExportCircuit,
      isExportCircuitOpenError,
    }, limits);
  }

  async listBackups(query: ListBackupsInput) {
    return this.readOperations.listBackups(query);
  }

  async getBackupMetadata(backupId: string, username: string) {
    return this.readOperations.getBackupMetadata(backupId, username);
  }

  async exportBackup(
    backupId: string,
    username: string,
  ): Promise<
    BackupOperationResponse<
      | {
          fileName: string;
          payloadPrefixJson: string;
          backupDataJsonChunks: AsyncIterable<string>;
          payloadSuffixJson: string;
        }
      | { message: string }
    >
  > {
    return this.readOperations.exportBackup(backupId, username);
  }

  async createBackup(params: CreateBackupInput) {
    return this.mutationOperations.createBackup(params);
  }

  async restoreBackup(params: RestoreBackupInput) {
    return this.mutationOperations.restoreBackup(params);
  }

  async deleteBackup(params: DeleteBackupInput) {
    return this.mutationOperations.deleteBackup(params);
  }
}
