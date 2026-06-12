import type { User, UserActivity } from "../../shared/schema-postgres";

export const ACTIVITY_QUERY_PAGE_LIMIT = 1000;

export type ActivityRepositoryOptions = {
  ensureBannedSessionsTable: () => Promise<void>;
};

export type ActivityWithStatus = UserActivity & { status: string };

export type ActivityPageSortBy = "duration" | "loginTime" | "status" | "username";
export type ActivityPageSortOrder = "asc" | "desc";

export type ActivityPageFilters = {
  status?: string[] | undefined;
  username?: string | undefined;
  ipAddress?: string | undefined;
  browser?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
};

export type ActivityPageParams = {
  page: number;
  pageSize: number;
  sortBy: ActivityPageSortBy;
  sortOrder: ActivityPageSortOrder;
  currentActivityId?: string | undefined;
  filters?: ActivityPageFilters | undefined;
};

export type ActivityStatusSummary = {
  idleCount: number;
  kickedCount: number;
  logoutCount: number;
  onlineCount: number;
};

export type ActivityPageResult = {
  activities: ActivityWithStatus[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: ActivityStatusSummary;
};

export type AuthenticatedSessionSnapshot = {
  activity: UserActivity;
  user?: User | undefined;
  isVisitorBanned: boolean;
};

export type BannedUserWithInfo = User & {
  banInfo?: { ipAddress: string | null; browser: string | null; bannedAt: Date | null } | undefined;
};

export type BannedUserRow = {
  id?: unknown;
  username?: unknown;
  password_hash?: unknown;
  full_name?: unknown;
  email?: unknown;
  role?: unknown;
  status?: unknown;
  must_change_password?: unknown;
  password_reset_by_superuser?: unknown;
  created_by?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  password_changed_at?: unknown;
  activated_at?: unknown;
  last_login_at?: unknown;
  is_banned?: unknown;
  two_factor_enabled?: unknown;
  two_factor_secret_encrypted?: unknown;
  two_factor_configured_at?: unknown;
  failed_login_attempts?: unknown;
  locked_at?: unknown;
  locked_reason?: unknown;
  locked_by_system?: unknown;
  banLogoutTime?: unknown;
  banIpAddress?: unknown;
  banBrowser?: unknown;
};
