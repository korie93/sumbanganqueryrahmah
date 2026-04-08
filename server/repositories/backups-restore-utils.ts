import { db } from "../db-postgres";
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

type BackupPayloadSource = BackupDataPayload | string;

export {
  createBackupPayloadChunkReader,
  createBackupPayloadSectionReader,
  prepareBackupPayloadFileForCreate,
} from "./backups-payload-utils";

export async function restoreFromBackup(
  backupDataRaw: BackupPayloadSource,
): Promise<{ success: boolean; stats: RestoreStats }> {
  const backupDataReader = createBackupPayloadChunkReader(
    (backupDataRaw || {}) as BackupPayloadSource,
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
