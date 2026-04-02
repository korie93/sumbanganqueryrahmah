import { downloadBlob } from "@/lib/download";
import { formatDateTimeMalaysia } from "@/lib/date-format";
import type { AuditLogRecord } from "@/pages/audit-logs/types";
import { getAuditActionLabel } from "@/pages/audit-logs/utils";

let auditLogsJsPdfModulePromise: Promise<typeof import("jspdf")> | null = null;

function escapeCsvValue(value: string) {
  return `"${(value || "").replace(/"/g, '""')}"`;
}

function formatAuditExportTime(value: string) {
  return formatDateTimeMalaysia(value, { includeSeconds: true, fallback: value });
}

export function buildAuditLogsCsvContent(logs: AuditLogRecord[]) {
  const headers = ["Action", "Performed By", "Target User", "Resource", "Details", "Timestamp"];
  return [
    headers.map(escapeCsvValue).join(","),
    ...logs.map((log) =>
      [
        escapeCsvValue(getAuditActionLabel(log.action)),
        escapeCsvValue(log.performedBy),
        escapeCsvValue(log.targetUser || ""),
        escapeCsvValue(log.targetResource || ""),
        escapeCsvValue(log.details || ""),
        escapeCsvValue(formatAuditExportTime(log.timestamp)),
      ].join(","),
    ),
  ].join("\n");
}

export function exportAuditLogsToCsv(logs: AuditLogRecord[]) {
  if (logs.length === 0) return;

  const csvContent = buildAuditLogsCsvContent(logs);
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
  pdf.text(
    `${logs.length} records | Generated: ${formatDateTimeMalaysia(new Date(), { includeSeconds: true })}`,
    margin,
    yPos,
  );
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
      formatAuditExportTime(log.timestamp),
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
