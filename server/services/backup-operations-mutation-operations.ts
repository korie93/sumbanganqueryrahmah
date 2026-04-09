import {
  type BackupErrorBody,
  type BackupOperationResponse,
  type CreateBackupInput,
  type DeleteBackupInput,
  type RestoreBackupInput,
  type RestoreBackupSuccessBody,
} from "./backup-operations-types";
import type {
  BackupOperationsMutationConfig,
  BackupOperationsMutationDeps,
} from "./backup-operations-mutation-shared";
import { executeCreateBackup } from "./backup-operations-create-operations";
import { executeRestoreBackup } from "./backup-operations-restore-operations";
import { executeDeleteBackup } from "./backup-operations-delete-operations";

export class BackupOperationsMutationOperations {
  constructor(
    private readonly deps: BackupOperationsMutationDeps,
    private readonly limits: BackupOperationsMutationConfig["limits"],
  ) {}

  async createBackup(
    params: CreateBackupInput,
  ): Promise<
    BackupOperationResponse<Awaited<ReturnType<BackupOperationsMutationDeps["backupsRepository"]["createBackup"]>> | { message: string }>
  > {
    return executeCreateBackup(this.deps, params, this.limits);
  }

  async restoreBackup(
    params: RestoreBackupInput,
  ): Promise<BackupOperationResponse<RestoreBackupSuccessBody | { message: string }>> {
    return executeRestoreBackup(this.deps, params, this.limits);
  }

  async deleteBackup(
    params: DeleteBackupInput,
  ): Promise<BackupOperationResponse<{ success: boolean } | BackupErrorBody>> {
    return executeDeleteBackup(this.deps, params);
  }
}
