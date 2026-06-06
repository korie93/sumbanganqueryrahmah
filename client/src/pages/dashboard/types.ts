import type { LucideIcon } from "lucide-react";

export interface SummaryData {
  totalUsers: number;
  activeSessions: number;
  loginsToday: number;
  totalDataRows: number;
  totalImports: number;
  bannedUsers: number;
  collectionRecordVersionConflicts24h?: number;
  loginFailures24h?: number;
  backupActions24h?: number;
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

export type RecentLoginActivityStatus = "active" | "ended";

export interface RecentLoginActivity {
  browser: string | null;
  ipAddress: string | null;
  lastActivityTime: string | null;
  loginTime: string | null;
  logoutReason: string | null;
  logoutTime: string | null;
  role: string;
  status: RecentLoginActivityStatus;
  username: string;
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
  icon: LucideIcon;
  color: string;
}

export type DashboardAccessSignalTone = "success" | "warning" | "danger" | "info";

export interface DashboardAccessSignal {
  title: string;
  value: string;
  description: string;
  tone: DashboardAccessSignalTone;
}
