import type { BackupPayloadCounts } from "./backups-repository-types";
import {
  BACKUP_MAX_SERIALIZED_ROW_BYTES,
  QUERY_PAGE_LIMIT,
} from "./backups-repository-types";
import type {
  BackupCompositeCursorRow,
  BackupCursorRow,
  BackupPageFetcher,
} from "./backups-payload-db-utils";
import {
  type PreparedBackupWriteState,
  writeBackupChunk,
} from "./backups-payload-file-utils";

function getBackupRowCursor(row: BackupCursorRow | BackupCompositeCursorRow): string {
  return "backupCursor" in row ? row.backupCursor : row.id;
}

function serializeBackupRow(row: BackupCursorRow | BackupCompositeCursorRow): string {
  if ("backupCursor" in row) {
    const { backupCursor: _backupCursor, ...payloadRow } = row;
    return JSON.stringify(payloadRow);
  }
  return JSON.stringify(row);
}

export async function appendPagedJsonArray<
  T extends BackupCursorRow | BackupCompositeCursorRow,
>(
  state: PreparedBackupWriteState,
  key: string,
  fetchPage: BackupPageFetcher<T>,
): Promise<number> {
  await writeBackupChunk(state, `"${key}":[`);

  let lastId: string | null = null;
  let isFirstRow = true;
  let total = 0;

  while (true) {
    const rows = await fetchPage(lastId);
    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      if (!isFirstRow) {
        await writeBackupChunk(state, ",");
      }
      isFirstRow = false;
      const serializedRow = serializeBackupRow(row);
      const serializedRowBytes = Buffer.byteLength(serializedRow, "utf8");
      if (serializedRowBytes > BACKUP_MAX_SERIALIZED_ROW_BYTES) {
        throw new Error(
          `Backup export row in '${key}' exceeds the ${BACKUP_MAX_SERIALIZED_ROW_BYTES} byte serialization limit.`,
        );
      }
      state.maxSerializedRowBytes = Math.max(state.maxSerializedRowBytes, serializedRowBytes);
      await writeBackupChunk(state, serializedRow);
      total += 1;
      lastId = getBackupRowCursor(row);
    }

    if (rows.length < QUERY_PAGE_LIMIT) {
      break;
    }
  }

  await writeBackupChunk(state, "]");
  return total;
}

export function createEmptyBackupPayloadCounts(): BackupPayloadCounts {
  return {
    importsCount: 0,
    dataRowsCount: 0,
    usersCount: 0,
    auditLogsCount: 0,
    collectionSourceConfigsCount: 0,
    collectionSourceRowsCount: 0,
    collectionOspTargetsCount: 0,
    collectionRecordsCount: 0,
    collectionRecordPurgeHistoryCount: 0,
    collectionRecordReceiptsCount: 0,
    collectionOspSavedTargetsCount: 0,
    collectionOspTargetRevisionsCount: 0,
    collectionOspTargetSourcesCount: 0,
    collectionOspTargetSourceRowsCount: 0,
    collectionOspTargetAgingRowsCount: 0,
    collectionOspClientResultsCount: 0,
    collectionOspManualReconciliationsCount: 0,
    collectionOspManualReconciliationAuditCount: 0,
  };
}
