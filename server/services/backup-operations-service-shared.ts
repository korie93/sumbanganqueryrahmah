import {
  type BackupOperationResponse,
  type BackupOperationsBackupsRepository,
  type BackupOperationsStorage,
} from "./backup-operations-types";
import { getBackupPayloadReadErrorResponse } from "./backup-operations-integrity-utils";

export type BackupCircuitRunner = <T>(fn: () => Promise<T>) => Promise<T>;

export type BackupOperationsServiceDeps = {
  storage: BackupOperationsStorage;
  backupsRepository: BackupOperationsBackupsRepository;
  withExportCircuit: BackupCircuitRunner;
  isExportCircuitOpenError: (error: unknown) => boolean;
};

export function getCircuitOpenResponse<T>(
  error: unknown,
  isExportCircuitOpenError: (error: unknown) => boolean,
): BackupOperationResponse<T | { message: string }> {
  if (isExportCircuitOpenError(error)) {
    return {
      statusCode: 503,
      body: { message: "Export circuit is OPEN. Retry later." },
    };
  }

  throw error;
}

export function getBackupPayloadReadFailure<T>(
  error: unknown,
): BackupOperationResponse<T | { message: string }> | null {
  return getBackupPayloadReadErrorResponse(error);
}
