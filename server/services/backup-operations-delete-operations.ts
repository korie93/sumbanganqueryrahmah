import type {
  BackupErrorBody,
  BackupOperationResponse,
  DeleteBackupInput,
} from "./backup-operations-types";
import { getCircuitOpenResponse } from "./backup-operations-service-shared";
import type { BackupOperationsMutationDeps } from "./backup-operations-mutation-shared";

export async function executeDeleteBackup(
  deps: BackupOperationsMutationDeps,
  params: DeleteBackupInput,
): Promise<BackupOperationResponse<{ success: boolean } | BackupErrorBody>> {
  let backupMetadata;
  let deleted;

  try {
    backupMetadata = await deps.withExportCircuit(() =>
      deps.backupsRepository.getBackupMetadataById(params.backupId),
    );
    deleted = await deps.withExportCircuit(() =>
      deps.backupsRepository.deleteBackup(params.backupId),
    );
  } catch (error) {
    return getCircuitOpenResponse(error, deps.isExportCircuitOpenError);
  }

  if (!deleted) {
    return {
      statusCode: 404,
      body: { message: "Backup not found" },
    };
  }

  await deps.storage.createAuditLog({
    action: "DELETE_BACKUP",
    performedBy: params.username,
    targetResource: backupMetadata?.name || params.backupId,
  });

  return {
    statusCode: 200,
    body: { success: true },
  };
}
