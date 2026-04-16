import { getBackupEncryptionRuntimeConfig } from "../config/security";
import { runtimeConfig } from "../config/runtime";
import {
  assertBackupEncryptionConfig,
  resolveBackupEncryptionConfig,
  type BackupEncryptionConfig,
} from "./backups-encryption";
import {
  createBackup,
  createBackupFromPreparedPayload,
  deleteBackup,
  getBackupById,
  getBackupMetadataById,
  getBackups,
  iterateBackupDataJsonChunksById,
  listBackupsPage,
} from "./backups-list-utils";
import {
  prepareBackupPayloadFileForCreate,
  readPreparedBackupPayloadForStorage,
  restoreFromBackup,
} from "./backups-restore-utils";
import type {
  BackupDataPayload,
  BackupListPageParams,
  BackupListPageResult,
  BackupsRepositoryOptions,
  PreparedBackupPayloadFile,
  RestoreStats,
} from "./backups-repository-types";
import type {
  Backup,
  InsertBackup,
} from "../../shared/schema-postgres";

export class BackupsRepository {
  private readonly backupEncryption: BackupEncryptionConfig;

  constructor(private readonly options: BackupsRepositoryOptions) {
    const backupEncryptionRuntimeConfig = getBackupEncryptionRuntimeConfig();
    this.backupEncryption = resolveBackupEncryptionConfig({
      BACKUP_ENCRYPTION_KEY: backupEncryptionRuntimeConfig.encryptionKey ?? undefined,
      BACKUP_ENCRYPTION_KEYS: backupEncryptionRuntimeConfig.encryptionKeys ?? undefined,
      BACKUP_ENCRYPTION_KEY_ID: backupEncryptionRuntimeConfig.encryptionKeyId ?? undefined,
    }, backupEncryptionRuntimeConfig.requireEncryption);
    assertBackupEncryptionConfig(this.backupEncryption);
  }

  async createBackup(data: InsertBackup): Promise<Backup> {
    return createBackup(this.options, this.backupEncryption, data);
  }

  async createBackupFromPreparedPayload(
    data: Omit<InsertBackup, "backupData"> & { preparedBackupPayload: PreparedBackupPayloadFile },
  ): Promise<Backup> {
    return createBackupFromPreparedPayload(this.options, data);
  }

  async getBackups(): Promise<Backup[]> {
    return getBackups(this.options);
  }

  async listBackupsPage(params: BackupListPageParams = {}): Promise<BackupListPageResult> {
    return listBackupsPage(this.options, params);
  }

  async getBackupById(id: string): Promise<Backup | undefined> {
    return getBackupById(this.options, this.backupEncryption, id);
  }

  async iterateBackupDataJsonChunksById(id: string): Promise<AsyncIterable<string> | undefined> {
    return iterateBackupDataJsonChunksById(this.options, this.backupEncryption, id);
  }

  async getBackupMetadataById(id: string): Promise<Backup | undefined> {
    return getBackupMetadataById(this.options, id);
  }

  async deleteBackup(id: string): Promise<boolean> {
    return deleteBackup(this.options, id);
  }

  async prepareBackupPayloadFileForCreate(): Promise<PreparedBackupPayloadFile> {
    return prepareBackupPayloadFileForCreate(this.backupEncryption);
  }

  async readPreparedBackupPayloadForStorage(preparedBackupPayload: PreparedBackupPayloadFile): Promise<string> {
    return readPreparedBackupPayloadForStorage(preparedBackupPayload);
  }

  async restoreFromBackup(
    backupDataRaw: BackupDataPayload | string | AsyncIterable<string>,
  ): Promise<{ success: boolean; stats: RestoreStats }> {
    return restoreFromBackup(backupDataRaw, {
      maxPayloadBytes: runtimeConfig.runtime.backupMaxPayloadBytes,
    });
  }
}
