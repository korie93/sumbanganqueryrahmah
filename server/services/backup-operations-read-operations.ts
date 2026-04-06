import { readDate, readInteger, readOptionalString } from "../http/validation";
import { logger } from "../lib/logger";
import {
  buildBackupExportEnvelope,
  createBackupDownloadFileName,
  verifyBackupIntegrity,
} from "./backup-operations-integrity-utils";
import {
  type BackupOperationsBackupsRepository,
  type BackupOperationsStorage,
  type BackupMetadataRecord,
  type BackupOperationResponse,
  type BackupListResponse,
  type ListBackupsInput,
  type BackupRecord,
} from "./backup-operations-types";
import { getBackupPayloadReadFailure } from "./backup-operations-service-shared";

type ExportBackupBody =
  | {
      fileName: string;
      payloadPrefixJson: string;
      backupDataJson: string;
      payloadSuffixJson: string;
    }
  | { message: string };

export class BackupOperationsReadOperations {
  constructor(
    private readonly storage: BackupOperationsStorage,
    private readonly backupsRepository: BackupOperationsBackupsRepository,
  ) {}

  async listBackups(query: ListBackupsInput): Promise<BackupListResponse> {
    const page = Math.max(1, readInteger(query.page, 1));
    const pageSize = Math.max(1, Math.min(100, readInteger(query.pageSize, 25)));
    const searchName = readOptionalString(query.searchName ?? query.search);
    const createdBy = readOptionalString(query.createdBy);
    const dateFrom = readDate(query.dateFrom);
    const dateTo = readDate(query.dateTo);
    const sortBy = String(readOptionalString(query.sortBy) || "newest").toLowerCase();

    const result = await this.backupsRepository.listBackupsPage({
      page,
      pageSize,
      searchName: searchName ?? undefined,
      createdBy: createdBy ?? undefined,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined,
      sortBy:
        sortBy === "oldest" || sortBy === "name-asc" || sortBy === "name-desc"
          ? sortBy
          : "newest",
    });

    return {
      backups: result.backups,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  async getBackupMetadata(
    backupId: string,
    username: string,
  ): Promise<BackupOperationResponse<BackupMetadataRecord | { message: string }>> {
    const backup = await this.backupsRepository.getBackupMetadataById(backupId);
    if (!backup) {
      return {
        statusCode: 404,
        body: { message: "Backup not found" },
      };
    }

    await this.storage.createAuditLog({
      action: "VIEW_BACKUP_METADATA",
      performedBy: username,
      targetResource: backup.name,
      details: JSON.stringify({ backupId: backup.id }),
    });

    return {
      statusCode: 200,
      body: backup,
    };
  }

  async exportBackup(
    backupId: string,
    username: string,
  ): Promise<BackupOperationResponse<ExportBackupBody>> {
    let backup: BackupRecord | undefined;
    try {
      backup = await this.backupsRepository.getBackupById(backupId);
    } catch (error) {
      const payloadReadFailure = getBackupPayloadReadFailure<ExportBackupBody>(error);
      if (payloadReadFailure) {
        return payloadReadFailure;
      }
      throw error;
    }

    if (!backup) {
      return {
        statusCode: 404,
        body: { message: "Backup not found" },
      };
    }

    const backupDataJson = String(backup.backupData || "").trim();
    if (!backupDataJson) {
      return {
        statusCode: 500,
        body: { message: "Backup payload is not readable." },
      };
    }

    const integrity = verifyBackupIntegrity(backup);
    if (!integrity.ok) {
      logger.warn("Backup integrity mismatch detected during export", {
        backupId: backup.id,
        backupName: backup.name,
        username,
        storedChecksum: integrity.storedChecksum,
        computedChecksum: integrity.computedChecksum,
      });
      return {
        statusCode: 409,
        body: { message: "Backup integrity check failed. Export cancelled." },
      };
    }

    const envelopeJson = JSON.stringify(buildBackupExportEnvelope(backup, integrity));

    await this.storage.createAuditLog({
      action: "DOWNLOAD_BACKUP_EXPORT",
      performedBy: username,
      targetResource: backup.name,
      details: JSON.stringify({
        backupId: backup.id,
        integrityVerified: integrity.verified,
      }),
    });
    logger.warn("Backup export downloaded", {
      backupId: backup.id,
      backupName: backup.name,
      username,
      integrityVerified: integrity.verified,
    });

    return {
      statusCode: 200,
      body: {
        fileName: createBackupDownloadFileName(backup.name, backup.id),
        payloadPrefixJson: `${envelopeJson.slice(0, -1)},"backupData":`,
        backupDataJson,
        payloadSuffixJson: "}",
      },
    };
  }
}
