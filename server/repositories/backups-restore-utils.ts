import { db } from "../db-postgres";
import type { BackupDataPayload, RestoreStats } from "./backups-repository-types";
import {
  createBackupPayloadSectionReader,
  prepareBackupPayloadFileForCreate,
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
  createBackupPayloadSectionReader,
  prepareBackupPayloadFileForCreate,
} from "./backups-payload-utils";

export async function restoreFromBackup(
  backupDataRaw: BackupPayloadSource,
): Promise<{ success: boolean; stats: RestoreStats }> {
  const backupDataReader = createBackupPayloadSectionReader(
    (backupDataRaw || {}) as BackupPayloadSource,
  );
  const stats = createRestoreStats();

  await db.transaction(async (tx) => {
    await initializeRestoreTrackingTempTable(tx as any);
    await restoreImportsFromBackup(tx as any, backupDataReader, stats);
    await restoreDataRowsFromBackup(tx as any, backupDataReader, stats);
    await restoreUsersFromBackup(tx as any, backupDataReader, stats);
    await restoreAuditLogsFromBackup(tx as any, backupDataReader, stats);
    await restoreCollectionRecordsFromBackup(tx as any, backupDataReader, stats);
    await restoreCollectionRecordReceiptsFromBackup(tx as any, backupDataReader, stats);
    await syncRestoredCollectionReceiptCache(tx as any);
    await finalizeRestoredCollectionRollups(tx as any);
  });

  updateRestoreTotals(stats);
  return { success: true, stats };
}
