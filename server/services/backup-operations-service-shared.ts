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

export type BackupOperationsLimits = {
  maxPayloadBytes: number;
};

export const DEFAULT_BACKUP_MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;

function formatBackupPayloadLimit(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    const kibibytes = bytes / 1024;
    if (kibibytes >= 10) {
      return `${Math.round(kibibytes)} KiB`;
    }
    return `${kibibytes.toFixed(1)} KiB`;
  }
  const mebibytes = bytes / (1024 * 1024);
  if (mebibytes >= 10) {
    return `${Math.round(mebibytes)} MiB`;
  }
  return `${mebibytes.toFixed(1)} MiB`;
}

export function buildBackupPayloadTooLargeMessage(limitBytes: number) {
  return `Backup payload exceeds the configured ${formatBackupPayloadLimit(limitBytes)} limit. Narrow the dataset or increase BACKUP_MAX_PAYLOAD_BYTES.`;
}

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
