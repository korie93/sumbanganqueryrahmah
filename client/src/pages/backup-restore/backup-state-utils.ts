import type {
  BackupFilters,
  BackupJobRecord,
  BackupJobStatus,
  BackupRecord,
  BackupsResponse,
  RestoreResponse,
} from "@/pages/backup-restore/types";

type BackupQueryParamsOptions = {
  page: number;
  pageSize: number;
  deferredSearchName: string;
  createdByFilter: string;
  sortBy: string;
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
};

export function buildBackupQueryParams({
  page,
  pageSize,
  deferredSearchName,
  createdByFilter,
  sortBy,
  dateRange,
}: BackupQueryParamsOptions) {
  return {
    page,
    pageSize,
    searchName: deferredSearchName || undefined,
    createdBy: createdByFilter.trim() || undefined,
    dateFrom: dateRange.from ? dateRange.from.toISOString() : undefined,
    dateTo: dateRange.to ? dateRange.to.toISOString() : undefined,
    sortBy,
  };
}

export function getBackupPaginationFallback(
  page: number,
  pageSize: number,
  backups: BackupRecord[],
  response?: BackupsResponse,
) {
  return response?.pagination || {
    page,
    pageSize,
    total: backups.length,
    totalPages: Math.max(1, Math.ceil(backups.length / pageSize)),
  };
}

export function hasActiveBackupFilters(filters: BackupFilters) {
  return (
    Boolean(filters.searchName) ||
    Boolean(filters.createdByFilter) ||
    filters.sortBy !== "newest" ||
    filters.datePreset !== "all"
  );
}

export function isBackupJobInProgress(job?: BackupJobRecord | null, activeBackupJobId?: string | null) {
  return Boolean(activeBackupJobId) && (!job || job.status === "queued" || job.status === "running");
}

export function isBackupJobTerminal(status?: BackupJobStatus | null) {
  return status === "completed" || status === "failed";
}

export function buildRestoreSuccessSummary(result: RestoreResponse) {
  const stats = result.stats;
  const totalRestored = stats.totalInserted + stats.totalReactivated;
  const parts: string[] = [];

  if (stats.imports.inserted + stats.imports.reactivated > 0) {
    parts.push(`${stats.imports.inserted + stats.imports.reactivated} imports`);
  }
  if (stats.dataRows.inserted > 0) {
    parts.push(`${stats.dataRows.inserted} data rows`);
  }
  if (stats.users.inserted > 0) {
    parts.push(`${stats.users.inserted} users`);
  }
  if (stats.auditLogs.inserted > 0) {
    parts.push(`${stats.auditLogs.inserted} audit logs`);
  }
  if (stats.collectionRecords.inserted > 0) {
    parts.push(`${stats.collectionRecords.inserted} collection records`);
  }
  if (stats.collectionRecordReceipts.inserted > 0) {
    parts.push(`${stats.collectionRecordReceipts.inserted} collection receipts`);
  }

  const summary = totalRestored > 0
    ? `Restored: ${parts.join(", ")}.`
    : "No new records were added (data may already exist).";
  const duration = result.durationMs != null
    ? ` Duration: ${(result.durationMs / 1000).toFixed(1)}s.`
    : "";

  return {
    title: totalRestored > 0 ? "Restore Successful" : "Restore Complete",
    description: `${summary}${duration}`,
  };
}
