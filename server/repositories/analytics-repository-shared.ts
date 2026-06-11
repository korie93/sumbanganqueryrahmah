import { sql } from "drizzle-orm";
import { runtimeConfig } from "../config/runtime";

export const ANALYTICS_TZ = runtimeConfig.runtime.analyticsTimeZone;
export const COLLECTION_RECORD_VERSION_CONFLICT_ACTION = "COLLECTION_RECORD_VERSION_CONFLICT";
export const LOGIN_FAILURE_ACTIONS = [
  "LOGIN_FAILED",
  "LOGIN_FAILED_BANNED",
  "LOGIN_FAILED_ACCOUNT_STATE",
  "LOGIN_FAILED_PASSWORD",
  "LOGIN_FAILED_PASSWORD_LOCKED",
  "LOGIN_BLOCKED_LOCKED_ACCOUNT",
  "LOGIN_BLOCKED_MAINTENANCE",
  "LOGIN_BLOCKED_SINGLE_SESSION",
  "LOGIN_2FA_FAILED",
  "LOGIN_2FA_FAILED_SECRET",
  "LOGIN_2FA_FAILED_BANNED",
  "LOGIN_2FA_FAILED_ACCOUNT_STATE",
  "LOGIN_2FA_BLOCKED_LOCKED_ACCOUNT",
  "LOGIN_2FA_BLOCKED_MAINTENANCE",
] as const;
export const BACKUP_ACTIVITY_ACTIONS = [
  "CREATE_BACKUP",
  "VIEW_BACKUP_METADATA",
  "DOWNLOAD_BACKUP_EXPORT",
  "RESTORE_BACKUP",
  "DELETE_BACKUP",
] as const;

export type TopActiveUserRow = {
  username: string;
  role: string;
  loginCount: number;
  lastLogin: Date | string | null;
};

export type RecentLoginActivityStatus = "active" | "ended" | "failed";
export type RecentLoginActivityFilter = "all" | RecentLoginActivityStatus | "attention";
export type RecentLoginActivitySortBy = "eventTime" | "role" | "status" | "username";
export type RecentLoginActivitySortOrder = "asc" | "desc";

export type RecentLoginActivityRow = {
  browser: string | null;
  eventType?: "failure" | "success" | null;
  failureReason?: string | null;
  id: string;
  ipAddress: string | null;
  isActive: boolean | null;
  lastActivityTime: Date | string | null;
  loginTime: Date | string | null;
  logoutReason: string | null;
  logoutTime: Date | string | null;
  platform?: string | null;
  role: string;
  status?: RecentLoginActivityStatus | null;
  userAgentSummary?: string | null;
  username: string;
};

export type RecentLoginActivity = {
  browser: string | null;
  eventType?: "failure" | "success";
  failureReason?: string | null;
  id: string;
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
};

export type RecentLoginActivityPageOptions = {
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  includeInternalReason?: boolean | undefined;
  page: number;
  pageSize: number;
  role?: string | undefined;
  search?: string | undefined;
  sortBy: RecentLoginActivitySortBy;
  sortOrder: RecentLoginActivitySortOrder;
  status: RecentLoginActivityFilter;
};

export type RecentLoginActivityPage = {
  activities: RecentLoginActivity[];
  filterCounts: Record<RecentLoginActivityFilter, number>;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export function buildAuditActionList(actions: readonly string[]) {
  return sql.join(actions.map((action) => sql`${action}`), sql`, `);
}

export function serializeAnalyticsTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function maskAnalyticsIpAddress(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (/^\d{1,3}\.\d{1,3}\.x\.x$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  if (/^[a-f0-9]{1,4}:[a-f0-9]{1,4}:\.\.\.$/i.test(normalized)) {
    return normalized;
  }

  const ipv4Parts = normalized.split(".");
  if (
    ipv4Parts.length === 4
    && ipv4Parts.every((part) => /^\d{1,3}$/.test(part))
  ) {
    const octets = ipv4Parts.map(Number);
    if (octets.every((octet) => octet >= 0 && octet <= 255)) {
      return `${octets[0]}.${octets[1]}.x.x`;
    }
  }

  if (normalized.includes(":")) {
    const segments = normalized.split(":").filter(Boolean);
    if (segments.length >= 2 && segments.every((segment) => /^[a-f0-9]{1,4}$/i.test(segment))) {
      return `${segments[0]}:${segments[1]}:...`;
    }
    return "IPv6";
  }

  return "Unknown";
}

export function summarizeAnalyticsBrowser(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  const knownBrowserLabel = normalized.match(
    /^(Edge|Opera|Firefox|Chrome|Chromium|Safari|Brave|Vivaldi|DuckDuckGo)(?:\s+\d{1,4})?$/i,
  );
  if (knownBrowserLabel) {
    return normalized;
  }
  if (lower.includes("edg/") || lower.includes("edge")) {
    const version = normalized.match(/(?:Edg|Edge)\/(\d+)/i)?.[1];
    return version ? `Edge ${version}` : "Edge";
  }
  if (lower.includes("opr/") || lower.includes("opera")) {
    const version = normalized.match(/(?:OPR|Opera)\/(\d+)/i)?.[1];
    return version ? `Opera ${version}` : "Opera";
  }
  if (lower.includes("firefox")) {
    const version = normalized.match(/Firefox\/(\d+)/i)?.[1];
    return version ? `Firefox ${version}` : "Firefox";
  }
  if (lower.includes("chrome") || lower.includes("chromium")) {
    const version = normalized.match(/(?:Chrome|Chromium)\/(\d+)/i)?.[1];
    return version ? `Chrome ${version}` : "Chrome";
  }
  if (lower.includes("safari")) {
    const version = normalized.match(/Version\/(\d+)/i)?.[1];
    return version ? `Safari ${version}` : "Safari";
  }

  if (/^[a-z0-9 ._-]{1,40}$/i.test(normalized)) {
    return normalized;
  }

  return "Browser";
}

export function sanitizeAnalyticsShortText(
  value: string | null | undefined,
  maxLength = 48,
): string | null {
  const normalized = value?.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const sanitized = normalized.replace(/[^a-zA-Z0-9 ._:/-]/g, "").trim();
  if (!sanitized) {
    return "Recorded";
  }

  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength - 3)}...` : sanitized;
}
