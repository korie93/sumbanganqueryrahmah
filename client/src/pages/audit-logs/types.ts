export interface AuditLogRecord {
  id: string;
  action: string;
  performedBy: string;
  targetUser?: string;
  targetResource?: string;
  details?: string;
  timestamp: string;
}

export interface AuditLogStats {
  total: number;
  olderThan30Days: number;
  olderThan60Days: number;
  olderThan90Days: number;
  oldestLogDate: string | null;
}

export interface AuditLogsResponse {
  logs: AuditLogRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AuditLogFilters {
  actionFilter: string;
  dateFrom: string;
  datePreset: string;
  dateTo: string;
  performedByFilter: string;
  searchText: string;
  targetUserFilter: string;
}

export interface AuditActionOption {
  value: string;
  label: string;
}

export interface AuditDatePresetOption {
  value: string;
  label: string;
}
