export interface BackupMetadata {
  importsCount: number;
  dataRowsCount: number;
  usersCount: number;
  auditLogsCount: number;
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
}

export interface RestoreResponse {
  success: boolean;
  message: string;
  stats: {
    imports: number;
    dataRows: number;
    users: number;
    auditLogs: number;
  };
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
}

export interface BackupOption {
  value: string;
  label: string;
}
