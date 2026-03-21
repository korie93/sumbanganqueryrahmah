export interface BackupMetadata {
  importsCount: number;
  dataRowsCount: number;
  usersCount: number;
  auditLogsCount: number;
  collectionRecordsCount?: number;
  collectionRecordReceiptsCount?: number;
  createdAt: string;
}

export interface BackupRecord {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  metadata: BackupMetadata | null;
}

export interface BackupsResponse {
  backups: BackupRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface RestoreResponse {
  success: boolean;
  message: string;
  backupId?: string;
  backupName?: string;
  restoredAt?: string;
  durationMs?: number;
  stats: {
    imports: RestoreDatasetStats;
    dataRows: RestoreDatasetStats;
    users: RestoreDatasetStats;
    auditLogs: RestoreDatasetStats;
    collectionRecords: RestoreDatasetStats;
    collectionRecordReceipts: RestoreDatasetStats;
    warnings: string[];
    totalProcessed: number;
    totalInserted: number;
    totalSkipped: number;
    totalReactivated: number;
  };
}

export interface RestoreDatasetStats {
  processed: number;
  inserted: number;
  skipped: number;
  reactivated: number;
}

export interface BackupFilters {
  createdByFilter: string;
  dateFrom: string;
  datePreset: string;
  dateTo: string;
  searchName: string;
  sortBy: string;
}

export interface BackupRestoreProps {
  userRole?: string;
  embedded?: boolean;
}

export interface BackupOption {
  value: string;
  label: string;
}
