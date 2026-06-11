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

export interface DashboardLoginTrendInsights {
  averageDailyLogins: number;
  netSessions: number;
  peakDate: string | null;
  peakLogins: number;
  totalLogins: number;
  totalLogouts: number;
}

export interface TopUser {
  username: string;
  role: string;
  loginCount: number;
  lastLogin: string | null;
}

export type RecentLoginActivityStatus = "active" | "ended" | "failed";
export type RecentLoginActivityFilter = "all" | RecentLoginActivityStatus | "attention";
export type RecentLoginActivitySortBy = "eventTime" | "role" | "status" | "username";
export type RecentLoginActivitySortOrder = "asc" | "desc";

export interface RecentLoginActivity {
  browser: string | null;
  eventType?: "failure" | "success";
  failureReason?: string | null;
  id?: string | null;
  ipAddress: string | null;
  lastActivityTime: string | null;
  loginTime: string | null;
  logoutReason: string | null;
  logoutTime: string | null;
  platform?: string | null;
  role: string;
  status: RecentLoginActivityStatus;
  userAgentSummary?: string | null;
  username: string;
}

export interface RecentLoginActivityPage {
  activities: RecentLoginActivity[];
  filterCounts: Record<RecentLoginActivityFilter, number>;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface RecentLoginActivityPageQuery {
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
  role?: string;
  search?: string;
  sortBy?: RecentLoginActivitySortBy;
  sortOrder?: RecentLoginActivitySortOrder;
  status: RecentLoginActivityFilter;
}

export interface PeakHour {
  hour: number;
  count: number;
}

export interface DashboardPeakHourInsights {
  averageHourlyLogins: number;
  peakCount: number;
  peakHour: number | null;
  peakShare: number;
  totalLogins: number;
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

export interface DashboardLoginRiskInsight {
  title: string;
  value: string;
  description: string;
  tone: DashboardAccessSignalTone;
}

export interface DashboardLoginRiskSummary {
  label: string;
  description: string;
  tone: DashboardAccessSignalTone;
}

export interface DashboardLoginHealthScore {
  score: number;
  label: "Healthy" | "Watch" | "Attention";
  description: string;
  tone: DashboardAccessSignalTone;
  deductions: string[];
}

export interface DashboardLoginRiskExplanation {
  headline: string;
  items: DashboardLoginRiskInsight[];
  footer: string;
}

export type DashboardActionQueuePriority = "high" | "medium" | "low";

export interface DashboardActionQueueItem {
  id: string;
  title: string;
  description: string;
  priority: DashboardActionQueuePriority;
  actionLabel: string;
  targetHref: string;
}

export type DashboardSessionHealthItemId =
  | "active"
  | "fresh"
  | "idle-watch"
  | "stale"
  | "timeout-ended";

export type DashboardSessionHealthTone = DashboardAccessSignalTone;

export interface DashboardSessionHealthItem {
  id: DashboardSessionHealthItemId;
  label: string;
  value: number;
  description: string;
  tone: DashboardSessionHealthTone;
}

export type DashboardLoginPatternFactId =
  | "top-account"
  | "common-browser"
  | "peak-window"
  | "attention-reason";

export type DashboardLoginPatternTone = DashboardAccessSignalTone;

export interface DashboardLoginPatternFact {
  id: DashboardLoginPatternFactId;
  label: string;
  value: string;
  description: string;
  tone: DashboardLoginPatternTone;
}

export interface DashboardLoginPatternSummary {
  statusLabel: string;
  statusTone: DashboardLoginPatternTone;
  operatorNote: string;
  facts: DashboardLoginPatternFact[];
}
