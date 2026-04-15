import { downloadBlob } from "@/lib/download";
import { formatDateTimeMalaysia } from "@/lib/date-format";
import { createRetryableModuleLoader } from "@/lib/retryable-module-loader";
import type { BackupRecord } from "@/pages/backup-restore/types";

const loadBackupsJsPdfModule = createRetryableModuleLoader<typeof import("jspdf")>(
  () => import("jspdf"),
);

function escapeCsvValue(value: string) {
  return `"${(value || "").replace(/"/g, '""')}"`;
}

function formatBackupExportTime(dateStr: string) {
  return formatDateTimeMalaysia(dateStr, { includeSeconds: true, fallback: dateStr });
}

export function buildBackupsCsvContent(backups: BackupRecord[]) {
  const headers = ["Name", "Created By", "Created At", "Imports", "Data Rows", "Users", "Audit Logs"];
  return [
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
}

export function exportBackupsToCsv(backups: BackupRecord[]) {
  if (backups.length === 0) return;

  const csvContent = buildBackupsCsvContent(backups);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `SQR-backups-${new Date().toISOString().split("T")[0]}.csv`);
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
  pdf.text(
    `${backups.length} backups | Generated: ${formatDateTimeMalaysia(new Date(), { includeSeconds: true })}`,
    margin,
    yPos,
  );
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
