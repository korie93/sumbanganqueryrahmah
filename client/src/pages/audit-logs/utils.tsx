import { Badge } from "@/components/ui/badge";
import { formatDateTimeMalaysia } from "@/lib/date-format";
import type {
  AuditActionOption,
  AuditDatePresetOption,
  AuditLogFilters,
  AuditLogRecord,
  AuditLogStats,
} from "@/pages/audit-logs/types";

type AuditBadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const auditActionLabels: Record<string, { label: string; variant: AuditBadgeVariant }> = {
  KICK_USER: { label: "Force Logout", variant: "secondary" },
  KICK_USER_FAILED: { label: "Force Logout Failed", variant: "outline" },
  BAN_USER: { label: "Ban User", variant: "destructive" },
  BAN_USER_FAILED: { label: "Ban Failed", variant: "outline" },
  UNBAN_USER: { label: "Unban User", variant: "default" },
  IMPORT_DATA: { label: "Import Data", variant: "default" },
  DELETE_IMPORT: { label: "Delete Import", variant: "destructive" },
  DELETE_IMPORT_FAILED: { label: "Delete Import Failed", variant: "outline" },
  CREATE_BACKUP: { label: "Create Backup", variant: "default" },
  RESTORE_BACKUP: { label: "Restore Backup", variant: "secondary" },
  RESTORE_BACKUP_FAILED: { label: "Restore Failed", variant: "outline" },
  DELETE_BACKUP: { label: "Delete Backup", variant: "destructive" },
  DELETE_BACKUP_FAILED: { label: "Delete Backup Failed", variant: "outline" },
  CLEANUP_AUDIT_LOGS: { label: "Cleanup Logs", variant: "destructive" },
  RENAME_IMPORT: { label: "Rename Import", variant: "secondary" },
  LOGIN_SUCCESS: { label: "Login Success", variant: "default" },
  LOGOUT: { label: "Logout", variant: "secondary" },
  LOGIN_FAILED_PASSWORD: { label: "Password Failed", variant: "outline" },
  LOGIN_BLOCKED_SINGLE_SESSION: { label: "Single Session Blocked", variant: "destructive" },
  COLLECTION_RECORD_CREATED: { label: "Record Created", variant: "default" },
  COLLECTION_NICKNAME_PASSWORD_SET: { label: "Nickname Password Set", variant: "secondary" },
  COLLECTION_NICKNAME_CREATED: { label: "Nickname Created", variant: "default" },
};

export const auditActionOptions: AuditActionOption[] = [
  { value: "all", label: "All Actions" },
  { value: "KICK_USER", label: "Force Logout" },
  { value: "KICK_USER_FAILED", label: "Force Logout Failed" },
  { value: "BAN_USER", label: "Ban User" },
  { value: "BAN_USER_FAILED", label: "Ban Failed" },
  { value: "UNBAN_USER", label: "Unban User" },
  { value: "IMPORT_DATA", label: "Import Data" },
  { value: "DELETE_IMPORT", label: "Delete Import" },
  { value: "DELETE_IMPORT_FAILED", label: "Delete Import Failed" },
  { value: "CREATE_BACKUP", label: "Create Backup" },
  { value: "RESTORE_BACKUP", label: "Restore Backup" },
  { value: "RESTORE_BACKUP_FAILED", label: "Restore Failed" },
  { value: "DELETE_BACKUP", label: "Delete Backup" },
  { value: "DELETE_BACKUP_FAILED", label: "Delete Backup Failed" },
  { value: "CLEANUP_AUDIT_LOGS", label: "Cleanup Logs" },
  { value: "RENAME_IMPORT", label: "Rename Import" },
];

export const auditDatePresets: AuditDatePresetOption[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "Last 30 Days" },
  { value: "quarter", label: "Last 3 Months" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom Date" },
];

export function getAuditDateRange(preset: string, dateFrom: string, dateTo: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today":
      return { from: today, to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) };
    case "yesterday": {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return { from: yesterday, to: new Date(today.getTime() - 1) };
    }
    case "week": {
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: weekAgo, to: now };
    }
    case "month": {
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: monthAgo, to: now };
    }
    case "quarter": {
      const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { from: quarterAgo, to: now };
    }
    case "year": {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return { from: startOfYear, to: now };
    }
    case "custom":
      return {
        from: dateFrom ? new Date(dateFrom) : null,
        to: dateTo ? new Date(`${dateTo}T23:59:59`) : null,
      };
    default:
      return { from: null, to: null };
  }
}

export function filterAuditLogs(logs: AuditLogRecord[], filters: AuditLogFilters) {
  return logs.filter((log) => {
    if (filters.actionFilter !== "all" && log.action !== filters.actionFilter) {
      return false;
    }

    if (
      filters.performedByFilter &&
      !log.performedBy.toLowerCase().includes(filters.performedByFilter.toLowerCase())
    ) {
      return false;
    }

    if (
      filters.targetUserFilter &&
      (!log.targetUser || !log.targetUser.toLowerCase().includes(filters.targetUserFilter.toLowerCase()))
    ) {
      return false;
    }

    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const matchesDetails = log.details?.toLowerCase().includes(searchLower);
      const matchesResource = log.targetResource?.toLowerCase().includes(searchLower);
      const matchesAction = getAuditActionLabel(log.action).toLowerCase().includes(searchLower);
      if (!matchesDetails && !matchesResource && !matchesAction) {
        return false;
      }
    }

    if (filters.datePreset !== "all") {
      const { from, to } = getAuditDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
      const logDate = new Date(log.timestamp);
      if (from && logDate < from) return false;
      if (to && logDate > to) return false;
    }

    return true;
  });
}

export function formatAuditTime(dateStr: string) {
  return formatDateTimeMalaysia(dateStr, { includeSeconds: true, fallback: dateStr });
}

export function getAuditActionLabel(action: string) {
  return auditActionLabels[action]?.label || formatFallbackAuditActionLabel(action);
}

function formatFallbackAuditActionLabel(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getAuditActionInfo(action: string) {
  const actionInfo = auditActionLabels[action] || { label: formatFallbackAuditActionLabel(action), variant: "outline" as const };
  return {
    ...actionInfo,
    rawAction: action,
  };
}

function normalizeAuditDetails(details: string) {
  return details.replace(/\s+/g, " ").trim();
}

export function shouldCollapseAuditDetails(details: string, maxLength = 180) {
  return normalizeAuditDetails(details).length > maxLength;
}

export function getAuditDetailsPreview(details: string, maxLength = 180) {
  const normalized = normalizeAuditDetails(details);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function getAuditActionBadge(action: string, className?: string) {
  const actionInfo = getAuditActionInfo(action);
  return (
    <Badge variant={actionInfo.variant} className={className}>
      {actionInfo.label}
    </Badge>
  );
}

export function getLogsToDeleteCount(stats: AuditLogStats | null, cleanupDays: string) {
  if (!stats) return 0;
  const days = Number.parseInt(cleanupDays, 10);
  if (days <= 30) return stats.olderThan30Days;
  if (days <= 60) return stats.olderThan60Days;
  if (days <= 90) return stats.olderThan90Days;
  return stats.olderThan90Days;
}
