import { readDate, readInteger, readOptionalString } from "../http/validation";
import { logger } from "../lib/logger";
import {
  buildBackupExportEnvelope,
  createBackupDownloadFileName,
  readStoredPayloadBytes,
  verifyBackupIntegrityFromChunks,
} from "./backup-operations-integrity-utils";
import {
  type BackupOperationsBackupsRepository,
  type BackupOperationsStorage,
  type BackupIntegrityResult,
  type BackupMetadataRecord,
  type BackupOperationResponse,
  type BackupListResponse,
  type ListBackupsInput,
} from "./backup-operations-types";
import {
  buildBackupPayloadTooLargeMessage,
  getBackupPayloadReadFailure,
  type BackupOperationsLimits,
} from "./backup-operations-service-shared";

type ExportBackupBody =
  | {
      fileName: string;
      payloadPrefixJson: string;
      backupDataJsonChunks: AsyncIterable<string>;
      payloadSuffixJson: string;
    }
  | { message: string };

export class BackupOperationsReadOperations {
  constructor(
    private readonly storage: BackupOperationsStorage,
    private readonly backupsRepository: BackupOperationsBackupsRepository,
    private readonly limits: BackupOperationsLimits,
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
    let backup: BackupMetadataRecord | undefined;
    try {
      backup = await this.backupsRepository.getBackupMetadataById(backupId);
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

    const storedPayloadBytes = readStoredPayloadBytes(backup);
    if (
      typeof storedPayloadBytes === "number"
      && storedPayloadBytes > this.limits.maxPayloadBytes
    ) {
      logger.warn("Backup export blocked by metadata payload size preflight", {
        backupId: backup.id,
        backupName: backup.name,
        username,
        payloadBytes: storedPayloadBytes,
        maxPayloadBytes: this.limits.maxPayloadBytes,
      });
      return {
        statusCode: 413,
        body: { message: buildBackupPayloadTooLargeMessage(this.limits.maxPayloadBytes) },
      };
    }

    const createBackupDataJsonChunks = async () => {
      const chunks = await this.backupsRepository.iterateBackupDataJsonChunksById(backupId);
      if (!chunks) {
        throw new Error("Backup payload is not readable.");
      }
      return chunks;
    };

    let integrity: BackupIntegrityResult & { payloadBytes: number };
    try {
      integrity = await verifyBackupIntegrityFromChunks(
        backup,
        await createBackupDataJsonChunks(),
      );
    } catch (error) {
      const payloadReadFailure = getBackupPayloadReadFailure<ExportBackupBody>(error);
      if (payloadReadFailure) {
        return payloadReadFailure;
      }
      throw error;
    }

    if (integrity.payloadBytes <= 0) {
      return {
        statusCode: 500,
        body: { message: "Backup payload is not readable." },
      };
    }
    if (integrity.payloadBytes > this.limits.maxPayloadBytes) {
      logger.warn("Backup export blocked because the payload exceeds the configured size limit", {
        backupId: backup.id,
        backupName: backup.name,
        username,
        payloadBytes: integrity.payloadBytes,
        maxPayloadBytes: this.limits.maxPayloadBytes,
      });
      return {
        statusCode: 413,
        body: { message: buildBackupPayloadTooLargeMessage(this.limits.maxPayloadBytes) },
      };
    }

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
        backupDataJsonChunks: await createBackupDataJsonChunks(),
        payloadSuffixJson: "}",
      },
    };
  }
}
