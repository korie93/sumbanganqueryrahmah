import { promises as fs } from "node:fs";
import { buildBackupMetadata } from "./backup-operations-integrity-utils";
import type {
  BackupOperationResponse,
  CreateBackupInput,
  PreparedBackupPayloadFile,
} from "./backup-operations-types";
import { getCircuitOpenResponse } from "./backup-operations-service-shared";
import type { BackupOperationsMutationDeps } from "./backup-operations-mutation-shared";

type CreatedBackupRecord = Awaited<
  ReturnType<BackupOperationsMutationDeps["backupsRepository"]["createBackup"]>
>;

export async function executeCreateBackup(
  deps: BackupOperationsMutationDeps,
  params: CreateBackupInput,
): Promise<BackupOperationResponse<CreatedBackupRecord | { message: string }>> {
  let backup;
  let preparedBackupPayload: PreparedBackupPayloadFile | null = null;

  try {
    backup = await deps.withExportCircuit(async () => {
      const startTime = Date.now();
      preparedBackupPayload = await deps.backupsRepository.prepareBackupPayloadFileForCreate();

      try {
        const backupPayloadJson = await fs.readFile(preparedBackupPayload.tempFilePath, "utf8");
        const metadata = buildBackupMetadata(
          preparedBackupPayload,
          preparedBackupPayload.payloadChecksumSha256,
        );
        const created = await deps.backupsRepository.createBackup({
          name: params.name,
          createdBy: params.username,
          backupData: backupPayloadJson,
          metadata: JSON.stringify(metadata),
        });

        await deps.storage.createAuditLog({
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
    return getCircuitOpenResponse(error, deps.isExportCircuitOpenError);
  }

  return {
    statusCode: 200,
    body: backup,
  };
}
