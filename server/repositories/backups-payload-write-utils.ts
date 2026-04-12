import type { BackupPayloadCounts } from "./backups-repository-types";
import {
  BACKUP_MAX_SERIALIZED_ROW_BYTES,
  QUERY_PAGE_LIMIT,
} from "./backups-repository-types";
import type {
  BackupCursorRow,
  BackupPageFetcher,
} from "./backups-payload-db-utils";
import {
  type PreparedBackupWriteState,
  writeBackupChunk,
} from "./backups-payload-file-utils";

export async function appendPagedJsonArray<T extends BackupCursorRow>(
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
      const serializedRow = JSON.stringify(row);
      const serializedRowBytes = Buffer.byteLength(serializedRow, "utf8");
      if (serializedRowBytes > BACKUP_MAX_SERIALIZED_ROW_BYTES) {
        throw new Error(
          `Backup export row in '${key}' exceeds the ${BACKUP_MAX_SERIALIZED_ROW_BYTES} byte serialization limit.`,
        );
      }
      state.maxSerializedRowBytes = Math.max(state.maxSerializedRowBytes, serializedRowBytes);
      await writeBackupChunk(state, serializedRow);
      total += 1;
      lastId = row.id;
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
    collectionRecordsCount: 0,
    collectionRecordReceiptsCount: 0,
  };
}
