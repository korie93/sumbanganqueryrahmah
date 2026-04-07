import type { RestoreStats } from "./backups-repository-types";
import { createRestoreDatasetStats } from "./backups-repository-types";

export function createRestoreStats(): RestoreStats {
  return {
    imports: createRestoreDatasetStats(),
    dataRows: createRestoreDatasetStats(),
    users: createRestoreDatasetStats(),
    auditLogs: createRestoreDatasetStats(),
    collectionRecords: createRestoreDatasetStats(),
    collectionRecordReceipts: createRestoreDatasetStats(),
    warnings: [],
    totalProcessed: 0,
    totalInserted: 0,
    totalSkipped: 0,
    totalReactivated: 0,
  };
}

export function updateRestoreTotals(stats: RestoreStats) {
  const datasets = [
    stats.imports,
    stats.dataRows,
    stats.users,
    stats.auditLogs,
    stats.collectionRecords,
    stats.collectionRecordReceipts,
  ];
  stats.totalProcessed = datasets.reduce((sum, item) => sum + item.processed, 0);
  stats.totalInserted = datasets.reduce((sum, item) => sum + item.inserted, 0);
  stats.totalSkipped = datasets.reduce((sum, item) => sum + item.skipped, 0);
  stats.totalReactivated = datasets.reduce((sum, item) => sum + item.reactivated, 0);
}
