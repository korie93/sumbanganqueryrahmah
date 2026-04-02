import { downloadBlob } from "@/lib/download";
import { formatDateTimeMalaysia, formatOperationalDateTime } from "@/lib/date-format";
import type { BackupFilters, BackupOption, BackupRecord } from "@/pages/backup-restore/types";

type BackupRecordLike = Record<string, unknown>;
let backupJsPdfModulePromise: Promise<typeof import("jspdf")> | null = null;

export const backupDatePresets: BackupOption[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "Last 30 Days" },
  { value: "quarter", label: "Last 3 Months" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom Date" },
];

export const backupSortOptions: BackupOption[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
];

function isRecord(value: unknown): value is BackupRecordLike {
  return typeof value === "object" && value !== null;
}

export function normalizeBackup(raw: unknown): BackupRecord {
  const record = isRecord(raw) ? raw : {};
  let metadata = record.metadata ?? null;

  if (typeof metadata === "string") {
    if (metadata.length > 200_000) {
      metadata = null;
    } else {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = null;
      }
    }
  }

  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    createdAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    createdBy: String(record.createdBy ?? record.created_by ?? "system"),
        metadata: isRecord(metadata)
      ? {
          importsCount: Number(metadata.importsCount ?? metadata.imports_count ?? 0),
          dataRowsCount: Number(metadata.dataRowsCount ?? metadata.data_rows_count ?? 0),
          usersCount: Number(metadata.usersCount ?? metadata.users_count ?? 0),
          auditLogsCount: Number(metadata.auditLogsCount ?? metadata.audit_logs_count ?? 0),
          collectionRecordsCount: Number(
            metadata.collectionRecordsCount ?? metadata.collection_records_count ?? 0,
          ),
          collectionRecordReceiptsCount: Number(
            metadata.collectionRecordReceiptsCount
            ?? metadata.collection_record_receipts_count
            ?? 0,
          ),
          createdAt: String(metadata.createdAt ?? metadata.created_at ?? ""),
        }
      : null,
  };
}

export function getBackupDateRange(preset: string, dateFrom: string, dateTo: string) {
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

export function filterAndSortBackups(backups: BackupRecord[], filters: BackupFilters) {
  const filtered = backups.filter((backup) => {
    if (filters.searchName && !backup.name.toLowerCase().includes(filters.searchName.toLowerCase())) {
      return false;
    }

    if (
      filters.createdByFilter &&
      !backup.createdBy.toLowerCase().includes(filters.createdByFilter.toLowerCase())
    ) {
      return false;
    }

    if (filters.datePreset !== "all") {
      const { from, to } = getBackupDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
      const backupDate = new Date(backup.createdAt);
      if (from && backupDate < from) return false;
      if (to && backupDate > to) return false;
    }

    return true;
  });

  filtered.sort((left, right) => {
    switch (filters.sortBy) {
      case "newest":
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      case "oldest":
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      case "name-asc":
        return left.name.localeCompare(right.name);
      case "name-desc":
        return right.name.localeCompare(left.name);
      default:
        return 0;
    }
  });

  return filtered;
}

export function formatBackupTime(dateStr: string) {
  return formatOperationalDateTime(dateStr, { fallback: dateStr });
}

function formatBackupExportTime(dateStr: string) {
  return formatDateTimeMalaysia(dateStr, { includeSeconds: true, fallback: dateStr });
}

function escapeCsvValue(value: string) {
  return `"${(value || "").replace(/"/g, '""')}"`;
}

export function exportBackupsToCsv(backups: BackupRecord[]) {
  if (backups.length === 0) return;

  const headers = ["Name", "Created By", "Created At", "Imports", "Data Rows", "Users", "Audit Logs"];
  const csvContent = [
    headers.map(escapeCsvValue).join(","),
    ...backups.map((backup) =>
      [
        escapeCsvValue(backup.name),
        escapeCsvValue(backup.createdBy),
        escapeCsvValue(formatBackupExportTime(backup.createdAt)),
        escapeCsvValue(String(backup.metadata?.importsCount || 0)),
        escapeCsvValue(String(backup.metadata?.dataRowsCount || 0)),
        escapeCsvValue(String(backup.metadata?.usersCount || 0)),
        escapeCsvValue(String(backup.metadata?.auditLogsCount || 0)),
      ].join(","),
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `SQR-backups-${new Date().toISOString().split("T")[0]}.csv`);
}

function loadBackupsJsPdfModule() {
  if (!backupJsPdfModulePromise) {
    backupJsPdfModulePromise = import("jspdf");
  }

  return backupJsPdfModulePromise;
}

export async function exportBackupsToPdf(backups: BackupRecord[]) {
  if (backups.length === 0) return;

  const { default: jsPDF } = await loadBackupsJsPdfModule();
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
  pdf.text("Backup Records Report", margin, yPos + 6);
  yPos += 12;

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(isDark ? 180 : 100);
  pdf.text(`${backups.length} backups | Generated: ${formatDateTimeMalaysia(new Date(), { includeSeconds: true })}`, margin, yPos);
  yPos += 8;

  pdf.setDrawColor(isDark ? 100 : 200);
  pdf.setLineWidth(0.5);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 6;

  const headers = ["Name", "Created By", "Created At", "Imports", "Data Rows", "Users", "Audit Logs"];
  const colWidths = [50, 35, 50, 25, 30, 25, 30];
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

  backups.forEach((backup, rowIndex) => {
    if (rowsOnPage >= maxRowsPerPage - 1) {
      pdf.setFontSize(8);
      pdf.setTextColor(isDark ? 120 : 150);
      pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, pageHeight - 8);
      pdf.text("SQR System - Backups", margin, pageHeight - 8);

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
      backup.name,
      backup.createdBy,
      formatBackupExportTime(backup.createdAt),
      String(backup.metadata?.importsCount || 0),
      String(backup.metadata?.dataRowsCount || 0),
      String(backup.metadata?.usersCount || 0),
      String(backup.metadata?.auditLogsCount || 0),
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
  pdf.text("SQR System - Backups", margin, pageHeight - 8);
  pdf.save(`SQR-backups-${new Date().toISOString().split("T")[0]}.pdf`);
}
