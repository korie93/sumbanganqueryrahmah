import type { BackupsRepository } from "../repositories/backups.repository";
import type { PostgresStorage } from "../storage-postgres";

export type BackupOperationsStorage = Pick<PostgresStorage, "createAuditLog">;
export type BackupOperationsBackupsRepository = Pick<
  BackupsRepository,
  | "createBackup"
  | "createBackupFromPreparedPayload"
  | "deleteBackup"
  | "getBackupMetadataById"
  | "getBackupById"
  | "iterateBackupDataJsonChunksById"
  | "prepareBackupPayloadFileForCreate"
  | "readPreparedBackupPayloadForStorage"
  | "listBackupsPage"
  | "restoreFromBackup"
>;
export type PreparedBackupPayloadFile = Awaited<
  ReturnType<BackupOperationsBackupsRepository["prepareBackupPayloadFileForCreate"]>
>;
export type BackupRecord = NonNullable<
  Awaited<ReturnType<BackupOperationsBackupsRepository["getBackupById"]>>
>;
export type BackupMetadataRecord = NonNullable<
  Awaited<ReturnType<BackupOperationsBackupsRepository["getBackupMetadataById"]>>
>;
type BackupListPage = Awaited<ReturnType<BackupOperationsBackupsRepository["listBackupsPage"]>>;
export type RestoreFromBackupResult = Awaited<
  ReturnType<BackupOperationsBackupsRepository["restoreFromBackup"]>
>;

export type BackupErrorBody = {
  message: string;
};

export type BackupListResponse = {
  backups: BackupListPage["backups"];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type BackupOperationResponse<T> = {
  statusCode: number;
  body: T;
};

export type RestoreBackupSuccessBody = {
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

export type BackupIntegrityResult = {
  ok: boolean;
  verified: boolean;
  storedChecksum: string | null;
  computedChecksum: string;
};

export type CreateBackupInput = {
  name: string;
  username: string;
};

export type RestoreBackupInput = {
  backupId: string;
  username: string;
};

export type DeleteBackupInput = {
  backupId: string;
  username: string;
};

export type ListBackupsInput = Record<string, unknown>;
