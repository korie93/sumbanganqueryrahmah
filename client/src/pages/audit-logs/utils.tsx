import { Badge } from "@/components/ui/badge";
import { downloadBlob } from "@/lib/download";
import { formatDateTimeMalaysia } from "@/lib/date-format";
import type {
  AuditActionOption,
  AuditDatePresetOption,
  AuditLogFilters,
  AuditLogRecord,
  AuditLogStats,
} from "@/pages/audit-logs/types";

type AuditBadgeVariant = "default" | "secondary" | "destructive" | "outline";
let auditLogsJsPdfModulePromise: Promise<typeof import("jspdf")> | null = null;

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

function escapeCsvValue(value: string) {
  return `"${(value || "").replace(/"/g, '""')}"`;
}

export function exportAuditLogsToCsv(logs: AuditLogRecord[]) {
  if (logs.length === 0) return;

  const headers = ["Action", "Performed By", "Target User", "Resource", "Details", "Timestamp"];
  const csvContent = [
    headers.map(escapeCsvValue).join(","),
    ...logs.map((log) =>
      [
        escapeCsvValue(getAuditActionLabel(log.action)),
        escapeCsvValue(log.performedBy),
        escapeCsvValue(log.targetUser || ""),
        escapeCsvValue(log.targetResource || ""),
        escapeCsvValue(log.details || ""),
        escapeCsvValue(formatAuditTime(log.timestamp)),
      ].join(","),
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `SQR-audit-logs-${new Date().toISOString().split("T")[0]}.csv`);
}

function loadAuditLogsJsPdfModule() {
  if (!auditLogsJsPdfModulePromise) {
    auditLogsJsPdfModulePromise = import("jspdf");
  }

  return auditLogsJsPdfModulePromise;
}

export async function exportAuditLogsToPdf(logs: AuditLogRecord[]) {
  if (logs.length === 0) return;

  const { default: jsPDF } = await loadAuditLogsJsPdfModule();
  const isDark = document.documentElement.classList.contains("dark");

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  let yPos = margin;

  pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");

  pdf.setFontSize(18);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(isDark ? 255 : 30);
  pdf.text("Audit Logs Report", margin, yPos + 6);
  yPos += 12;

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(isDark ? 180 : 100);
  pdf.text(`${logs.length} records | Generated: ${formatDateTimeMalaysia(new Date(), { includeSeconds: true })}`, margin, yPos);
  yPos += 8;

  pdf.setDrawColor(isDark ? 100 : 200);
  pdf.setLineWidth(0.5);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 6;

  const headers = ["Action", "Performed By", "Target User", "Resource", "Details", "Timestamp"];
  const colWidths = [35, 30, 30, 40, 70, 45];
  const rowHeight = 7;
  const maxRowsPerPage = Math.floor((pageHeight - yPos - 20) / rowHeight);

  const drawHeader = () => {
    pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
    pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(isDark ? 255 : 30);

    let xPos = margin;
    headers.forEach((header, index) => {
      pdf.text(header, xPos + 2, yPos + 5);
      xPos += colWidths[index];
    });

    yPos += rowHeight;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
  };

  drawHeader();

  let rowsOnPage = 0;
  let pageNum = 1;

  logs.forEach((log, rowIndex) => {
    if (rowsOnPage >= maxRowsPerPage - 1) {
      pdf.setFontSize(8);
      pdf.setTextColor(isDark ? 120 : 150);
      pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 8);
      pdf.text("SQR System - Audit Logs", margin, pageHeight - 8);

      pdf.addPage();
      pageNum += 1;
      yPos = margin;
      rowsOnPage = 0;

      pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
      drawHeader();
    }

    if (rowIndex % 2 === 0) {
      pdf.setFillColor(isDark ? 40 : 245, isDark ? 50 : 245, isDark ? 60 : 250);
      pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
    }

    pdf.setTextColor(isDark ? 220 : 50);
    let xPos = margin;
    const rowData = [
      getAuditActionLabel(log.action),
      log.performedBy,
      log.targetUser || "-",
      log.targetResource || "-",
      log.details || "-",
      formatAuditTime(log.timestamp),
    ];

    rowData.forEach((cell, index) => {
      const maxChars = Math.floor(colWidths[index] / 2);
      const text = cell.length > maxChars ? `${cell.substring(0, maxChars - 2)}..` : cell;
      pdf.text(text, xPos + 2, yPos + 5);
      xPos += colWidths[index];
    });

    yPos += rowHeight;
    rowsOnPage += 1;
  });

  pdf.setFontSize(8);
  pdf.setTextColor(isDark ? 120 : 150);
  pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 8);
  pdf.text("SQR System - Audit Logs", margin, pageHeight - 8);
  pdf.save(`SQR-audit-logs-${new Date().toISOString().split("T")[0]}.pdf`);
}
