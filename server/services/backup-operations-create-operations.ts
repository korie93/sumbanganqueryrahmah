import { logger } from "../lib/logger";
import { buildBackupMetadata } from "./backup-operations-integrity-utils";
import type {
  BackupOperationResponse,
  CreateBackupInput,
  PreparedBackupPayloadFile,
} from "./backup-operations-types";
import {
  buildBackupPayloadTooLargeMessage,
  getCircuitOpenResponse,
  type BackupOperationsLimits,
} from "./backup-operations-service-shared";
import type { BackupOperationsMutationDeps } from "./backup-operations-mutation-shared";

type CreatedBackupRecord = Awaited<
  ReturnType<BackupOperationsMutationDeps["backupsRepository"]["createBackup"]>
>;
type BackupCreateEarlyResponse = BackupOperationResponse<{ message: string }>;

function isBackupCreateEarlyResponse(value: unknown): value is BackupCreateEarlyResponse {
  return Boolean(
    value
    && typeof value === "object"
    && "statusCode" in value
    && "body" in value,
  );
}

export async function executeCreateBackup(
  deps: BackupOperationsMutationDeps,
  params: CreateBackupInput,
  limits: BackupOperationsLimits,
): Promise<BackupOperationResponse<CreatedBackupRecord | { message: string }>> {
  let backup: CreatedBackupRecord | BackupCreateEarlyResponse;
  let preparedBackupPayload: PreparedBackupPayloadFile | null = null;

  try {
    backup = await deps.withExportCircuit(async () => {
      const startTime = Date.now();
      preparedBackupPayload = await deps.backupsRepository.prepareBackupPayloadFileForCreate();

      try {
        if (preparedBackupPayload.payloadBytes > limits.maxPayloadBytes) {
          logger.warn("Backup creation blocked because the payload exceeds the configured size limit", {
            backupName: params.name,
            username: params.username,
            payloadBytes: preparedBackupPayload.payloadBytes,
            maxPayloadBytes: limits.maxPayloadBytes,
          });
          return {
            statusCode: 413,
            body: { message: buildBackupPayloadTooLargeMessage(limits.maxPayloadBytes) },
          };
        }

        const backupPayloadJson = await deps.backupsRepository.readPreparedBackupPayloadForStorage(
          preparedBackupPayload,
        );
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

  if (isBackupCreateEarlyResponse(backup)) {
    return backup;
  }

  return {
    statusCode: 200,
    body: backup,
  };
}
