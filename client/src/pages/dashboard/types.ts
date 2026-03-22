export interface SummaryData {
  totalUsers: number;
  activeSessions: number;
  loginsToday: number;
  totalDataRows: number;
  totalImports: number;
  bannedUsers: number;
  collectionRecordVersionConflicts24h?: number;
}

export interface LoginTrend {
  date: string;
  logins: number;
  logouts: number;
}

export interface TopUser {
  username: string;
  role: string;
  loginCount: number;
  lastLogin: string | null;
}

export interface PeakHour {
  hour: number;
  count: number;
}

export interface RoleData {
  role: string;
  count: number;
}

export interface SummaryCardItem {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}
