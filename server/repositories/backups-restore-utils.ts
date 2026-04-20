import { runtimeConfig } from "../config/runtime";
import { db } from "../db-postgres";
import { BackupPayloadTooLargeError } from "../lib/backup-payload-limit";
import { logger } from "../lib/logger";
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
export const BACKUP_RESTORE_TRANSACTION_PHASES = [
  "core-datasets",
  "collection-datasets",
] as const;

export type BackupRestoreTransactionPhase = (typeof BACKUP_RESTORE_TRANSACTION_PHASES)[number];

function isAsyncBackupPayloadSource(source: BackupPayloadSource): source is AsyncIterable<string> {
  return typeof source === "object"
    && source !== null
    && Symbol.asyncIterator in source
    && typeof source[Symbol.asyncIterator] === "function";
}

export function resolveBackupPayloadSourceKind(source: BackupPayloadSource): "json-stream" | "json-string" | "structured-object" {
  if (typeof source === "string") {
    return "json-string";
  }

  return isAsyncBackupPayloadSource(source) ? "json-stream" : "structured-object";
}

export function shouldLogSlowRestoreTransaction(durationMs: number, thresholdMs: number): boolean {
  return Number.isFinite(durationMs) && Number.isFinite(thresholdMs) && durationMs >= thresholdMs;
}

export function buildSlowRestoreTransactionLogMetadata(params: {
  durationMs: number;
  maxPayloadBytes: number;
  slowThresholdMs: number;
  sourceKind: ReturnType<typeof resolveBackupPayloadSourceKind>;
  stats: RestoreStats;
}) {
  const { durationMs, maxPayloadBytes, slowThresholdMs, sourceKind, stats } = params;

  return {
    durationMs,
    maxPayloadBytes,
    slowThresholdMs,
    sourceKind,
    warningCount: stats.warnings.length,
    totalInserted: stats.totalInserted,
    totalProcessed: stats.totalProcessed,
    totalReactivated: stats.totalReactivated,
    totalSkipped: stats.totalSkipped,
    stagedTransactions: BACKUP_RESTORE_TRANSACTION_PHASES.length,
    datasetStats: {
      auditLogs: { ...stats.auditLogs },
      collectionRecordReceipts: { ...stats.collectionRecordReceipts },
      collectionRecords: { ...stats.collectionRecords },
      dataRows: { ...stats.dataRows },
      imports: { ...stats.imports },
      users: { ...stats.users },
    },
  };
}

export async function executeBackupRestorePhases(params: {
  backupDataReader: ReturnType<typeof createBackupPayloadChunkReader>;
  maxTrackedRecordIds: number;
  runTransaction: (
    phase: BackupRestoreTransactionPhase,
    operation: (tx: import("./backups-restore-shared-utils").BackupRestoreExecutor) => Promise<void>,
  ) => Promise<void>;
  stats: RestoreStats;
}) {
  const {
    backupDataReader,
    maxTrackedRecordIds,
    runTransaction,
    stats,
  } = params;

  // Restore is intentionally staged so large payloads do not hold one global transaction
  // open across every dataset. Collection datasets remain grouped together because receipt
  // cache repair and rollup finalization still rely on the restored-record tracking table.
  await runTransaction("core-datasets", async (restoreTx) => {
    await restoreImportsFromBackup(restoreTx, backupDataReader, stats);
    await restoreDataRowsFromBackup(restoreTx, backupDataReader, stats);
    await restoreUsersFromBackup(restoreTx, backupDataReader, stats);
    await restoreAuditLogsFromBackup(restoreTx, backupDataReader, stats);
  });

  await runTransaction("collection-datasets", async (restoreTx) => {
    await initializeRestoreTrackingTempTable(restoreTx);
    await restoreCollectionRecordsFromBackup(restoreTx, backupDataReader, stats, {
      maxTrackedRecordIds,
    });
    await restoreCollectionRecordReceiptsFromBackup(restoreTx, backupDataReader, stats);
    await syncRestoredCollectionReceiptCache(restoreTx);
    await finalizeRestoredCollectionRollups(restoreTx);
  });
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
  const restoreStartedAt = Date.now();
  const slowRestoreThresholdMs = runtimeConfig.runtime.backupRestoreSlowTransactionMs;

  try {
    await executeBackupRestorePhases({
      backupDataReader,
      maxTrackedRecordIds: runtimeConfig.runtime.backupRestoreMaxTrackedCollectionRecordIds,
      runTransaction: async (_phase, operation) => {
        await db.transaction(async (tx) => {
          await operation(tx as import("./backups-restore-shared-utils").BackupRestoreExecutor);
        });
      },
      stats,
    });
  } finally {
    updateRestoreTotals(stats);
    const restoreDurationMs = Date.now() - restoreStartedAt;
    if (shouldLogSlowRestoreTransaction(restoreDurationMs, slowRestoreThresholdMs)) {
      logger.warn("Backup restore transaction exceeded slow-operation threshold", buildSlowRestoreTransactionLogMetadata({
        durationMs: restoreDurationMs,
        maxPayloadBytes,
        slowThresholdMs: slowRestoreThresholdMs,
        sourceKind: resolveBackupPayloadSourceKind(limitedBackupSource),
        stats,
      }));
    }
  }

  return { success: true, stats };
}
