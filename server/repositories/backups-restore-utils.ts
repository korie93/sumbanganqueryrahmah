import { runtimeConfig } from "../config/runtime";
import { db } from "../db-postgres";
import { BackupPayloadTooLargeError } from "../lib/backup-payload-limit";
import type { BackupDataPayload, RestoreStats } from "./backups-repository-types";
import {
  createBackupPayloadChunkReader,
} from "./backups-payload-utils";
import {
  createRestoreStats,
  finalizeRestoredCollectionRollups,
  initializeRestoreTrackingTempTable,
  restoreAuditLogsFromBackup,
  restoreCollectionRecordReceiptsFromBackup,
  restoreCollectionRecordsFromBackup,
  restoreDataRowsFromBackup,
  restoreImportsFromBackup,
  restoreUsersFromBackup,
  syncRestoredCollectionReceiptCache,
  updateRestoreTotals,
} from "./backups-restore-dataset-utils";

type BackupPayloadSource = BackupDataPayload | string | AsyncIterable<string>;
const BACKUP_PAYLOAD_DATASET_KEYS = [
  "imports",
  "dataRows",
  "users",
  "auditLogs",
  "collectionRecords",
  "collectionRecordReceipts",
] as const;

function isAsyncBackupPayloadSource(source: BackupPayloadSource): source is AsyncIterable<string> {
  return typeof source === "object"
    && source !== null
    && Symbol.asyncIterator in source
    && typeof source[Symbol.asyncIterator] === "function";
}

export {
  createBackupPayloadChunkReader,
  createBackupPayloadSectionReader,
  prepareBackupPayloadFileForCreate,
  readPreparedBackupPayloadForStorage,
} from "./backups-payload-utils";

function countStructuredBackupDatasetArrayBytes(dataset: unknown[]): number {
  let totalBytes = 2;

  for (let index = 0; index < dataset.length; index += 1) {
    if (index > 0) {
      totalBytes += 1;
    }

    const serialized = JSON.stringify(dataset[index]) ?? "null";
    totalBytes += Buffer.byteLength(serialized, "utf8");
  }

  return totalBytes;
}

function assertStructuredBackupPayloadWithinLimit(
  source: BackupDataPayload,
  limitBytes: number,
) {
  let totalBytes = 2;

  for (let index = 0; index < BACKUP_PAYLOAD_DATASET_KEYS.length; index += 1) {
    const key = BACKUP_PAYLOAD_DATASET_KEYS[index];
    const datasetValue = source[key];
    const normalizedDataset = Array.isArray(datasetValue) ? datasetValue : [];

    if (index > 0) {
      totalBytes += 1;
    }

    totalBytes += Buffer.byteLength(JSON.stringify(key), "utf8");
    totalBytes += 1;
    totalBytes += countStructuredBackupDatasetArrayBytes(normalizedDataset);

    if (totalBytes > limitBytes) {
      throw new BackupPayloadTooLargeError(limitBytes, totalBytes);
    }
  }
}

function enforceBackupPayloadLimit(
  source: BackupPayloadSource,
  limitBytes: number,
): BackupPayloadSource {
  if (typeof source === "string") {
    const payloadBytes = Buffer.byteLength(source, "utf8");
    if (payloadBytes > limitBytes) {
      throw new BackupPayloadTooLargeError(limitBytes, payloadBytes);
    }
    return source;
  }

  if (isAsyncBackupPayloadSource(source)) {
    return (async function* () {
      let payloadBytes = 0;

      for await (const chunk of source) {
        if (!chunk) {
          continue;
        }

        payloadBytes += Buffer.byteLength(chunk, "utf8");
        if (payloadBytes > limitBytes) {
          throw new BackupPayloadTooLargeError(limitBytes, payloadBytes);
        }

        yield chunk;
      }
    })();
  }

  assertStructuredBackupPayloadWithinLimit(source, limitBytes);
  return source;
}

export async function restoreFromBackup(
  backupDataRaw: BackupPayloadSource,
  options?: {
    maxPayloadBytes?: number;
  },
): Promise<{ success: boolean; stats: RestoreStats }> {
  const maxPayloadBytes = Math.max(
    1,
    Math.trunc(options?.maxPayloadBytes ?? runtimeConfig.runtime.backupMaxPayloadBytes),
  );
  const limitedBackupSource = enforceBackupPayloadLimit(
    (backupDataRaw || {}) as BackupPayloadSource,
    maxPayloadBytes,
  );
  const backupDataReader = createBackupPayloadChunkReader(
    limitedBackupSource,
  );
  const stats = createRestoreStats();

  await db.transaction(async (tx) => {
    const restoreTx = tx as import("./backups-restore-shared-utils").BackupRestoreExecutor;
    await initializeRestoreTrackingTempTable(restoreTx);
    await restoreImportsFromBackup(restoreTx, backupDataReader, stats);
    await restoreDataRowsFromBackup(restoreTx, backupDataReader, stats);
    await restoreUsersFromBackup(restoreTx, backupDataReader, stats);
    await restoreAuditLogsFromBackup(restoreTx, backupDataReader, stats);
    await restoreCollectionRecordsFromBackup(restoreTx, backupDataReader, stats);
    await restoreCollectionRecordReceiptsFromBackup(restoreTx, backupDataReader, stats);
    await syncRestoredCollectionReceiptCache(restoreTx);
    await finalizeRestoredCollectionRollups(restoreTx);
  });

  updateRestoreTotals(stats);
  return { success: true, stats };
}
