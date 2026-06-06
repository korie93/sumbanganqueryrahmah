import { sql } from "drizzle-orm";
import { runtimeConfig } from "../config/runtime";

export const ANALYTICS_TZ = runtimeConfig.runtime.analyticsTimeZone;
export const COLLECTION_RECORD_VERSION_CONFLICT_ACTION = "COLLECTION_RECORD_VERSION_CONFLICT";
export const LOGIN_FAILURE_ACTIONS = [
  "LOGIN_FAILED",
  "LOGIN_FAILED_BANNED",
  "LOGIN_FAILED_ACCOUNT_STATE",
  "LOGIN_BLOCKED_SINGLE_SESSION",
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

export type RecentLoginActivityStatus = "active" | "ended";

export type RecentLoginActivityRow = {
  browser: string | null;
  ipAddress: string | null;
  isActive: boolean | null;
  lastActivityTime: Date | string | null;
  loginTime: Date | string | null;
  logoutReason: string | null;
  logoutTime: Date | string | null;
  role: string;
  username: string;
};

export type RecentLoginActivity = {
  browser: string | null;
  ipAddress: string | null;
  lastActivityTime: string | null;
  loginTime: string | null;
  logoutReason: string | null;
  logoutTime: string | null;
  role: string;
  status: RecentLoginActivityStatus;
  username: string;
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
  if (lower.includes("edg/") || lower.includes("edge")) {
    return "Edge";
  }
  if (lower.includes("opr/") || lower.includes("opera")) {
    return "Opera";
  }
  if (lower.includes("firefox")) {
    return "Firefox";
  }
  if (lower.includes("chrome") || lower.includes("chromium")) {
    return "Chrome";
  }
  if (lower.includes("safari")) {
    return "Safari";
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
