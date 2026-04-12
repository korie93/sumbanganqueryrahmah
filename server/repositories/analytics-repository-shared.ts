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
