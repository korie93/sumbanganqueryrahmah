import { downloadViewerRowsAsCsv } from "@/pages/viewer/utils";
import type { DataRowWithId } from "@/pages/viewer/types";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";

interface ViewerExportParams {
  headers: string[];
  rows: DataRowWithId[];
  importName: string;
  exportFiltered?: boolean;
  exportSelected?: boolean;
}

let viewerJsPdfModulePromise: Promise<typeof import("jspdf")> | null = null;
let viewerXlsxModulePromise: Promise<typeof import("xlsx")> | null = null;

function loadViewerJsPdfModule() {
  if (!viewerJsPdfModulePromise) {
    viewerJsPdfModulePromise = import("jspdf");
  }

  return viewerJsPdfModulePromise;
}

function loadViewerXlsxModule() {
  if (!viewerXlsxModulePromise) {
    viewerXlsxModulePromise = import("xlsx");
  }

  return viewerXlsxModulePromise;
}

function buildViewerExportFilename(
  importName: string,
  extension: "csv" | "pdf" | "xlsx",
  exportFiltered = false,
  exportSelected = false,
) {
  let filename = `SQR-${importName || "export"}`;
  if (exportFiltered) filename += "-filtered";
  if (exportSelected) filename += "-selected";
  return `${filename}-${new Date().toISOString().split("T")[0]}.${extension}`;
}

export function exportViewerRowsToCsv({
  headers,
  rows,
  importName,
  exportFiltered,
  exportSelected,
}: ViewerExportParams) {
  if (rows.length === 0) return;

  downloadViewerRowsAsCsv(
    headers,
    rows,
    buildViewerExportFilename(importName, "csv", exportFiltered, exportSelected),
  );
}

export async function exportViewerRowsToPdf({
  headers,
  rows,
  importName,
  exportFiltered,
  exportSelected,
}: ViewerExportParams) {
  if (rows.length === 0) return;

  const { default: jsPDF } = await loadViewerJsPdfModule();
  const isDark = document.documentElement.classList.contains("dark");
  const useLandscape = headers.length > 4;
  const pdf = new jsPDF({
    orientation: useLandscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const tableWidth = pageWidth - margin * 2;
  const maxColsPerPage = useLandscape ? 10 : 6;
  const fontSize = headers.length > 8 ? 6 : headers.length > 5 ? 7 : 8;
  const rowHeight = fontSize <= 6 ? 5 : 6;
  const minColWidth = 18;
  const colWidth = Math.max(minColWidth, tableWidth / Math.min(headers.length, maxColsPerPage));
  const maxCharsPerCol = Math.floor((colWidth - 2) / (fontSize * 0.35));
  const maxRowsPerPage = Math.floor((pageHeight - margin - 25) / rowHeight);
  let yPos = margin;
  let rowsOnPage = 0;
  let pageNumber = 1;

  const truncateText = (text: string, maxLength: number) =>
    text.length <= maxLength ? text : `${text.substring(0, maxLength - 2)}..`;

  const drawBackground = () => {
    pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
  };

  const drawHeader = () => {
    pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
    pdf.rect(margin, yPos, tableWidth, rowHeight, "F");
    pdf.setFontSize(fontSize);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(isDark ? 255 : 30);
    headers.forEach((header, index) => {
      const xPos = margin + index * colWidth + 1;
      if (xPos < pageWidth - margin) {
        pdf.text(truncateText(header, maxCharsPerCol), xPos, yPos + rowHeight - 1.5);
      }
    });
    yPos += rowHeight;
  };

  drawBackground();
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(isDark ? 255 : 30);
  pdf.text(importName || "Data Export", margin, yPos + 5);
  yPos += 10;

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(isDark ? 180 : 100);
  let exportType = "All Data";
  if (exportFiltered) exportType = "Filtered Data";
  if (exportSelected) exportType = "Selected Data";
  pdf.text(
    `${exportType} | ${rows.length} rows | ${formatDateTimeDDMMYYYY(new Date(), { includeSeconds: true })}`,
    margin,
    yPos,
  );
  yPos += 6;

  pdf.setDrawColor(isDark ? 100 : 200);
  pdf.setLineWidth(0.3);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 4;

  drawHeader();
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(fontSize);

  rows.forEach((row, rowIndex) => {
    if (rowsOnPage >= maxRowsPerPage - 1) {
      pdf.setFontSize(7);
      pdf.setTextColor(isDark ? 120 : 150);
      pdf.text(`Page ${pageNumber}`, pageWidth - margin - 12, pageHeight - 6);
      pdf.text("SQR System", margin, pageHeight - 6);

      pdf.addPage();
      pageNumber += 1;
      yPos = margin;
      rowsOnPage = 0;
      drawBackground();
      drawHeader();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize);
    }

    if (rowIndex % 2 === 0) {
      pdf.setFillColor(isDark ? 40 : 245, isDark ? 50 : 245, isDark ? 60 : 250);
      pdf.rect(margin, yPos, tableWidth, rowHeight, "F");
    }

    pdf.setTextColor(isDark ? 220 : 50);
    headers.forEach((header, index) => {
      const xPos = margin + index * colWidth + 1;
      if (xPos < pageWidth - margin) {
        const cellValue = String(row[header] || "");
        pdf.text(truncateText(cellValue, maxCharsPerCol), xPos, yPos + rowHeight - 1.5);
      }
    });

    yPos += rowHeight;
    rowsOnPage += 1;
  });

  pdf.setFontSize(8);
  pdf.setTextColor(isDark ? 120 : 150);
  pdf.text(`Page ${pageNumber}`, pageWidth - margin - 15, pageHeight - 8);
  pdf.text("SQR System", margin, pageHeight - 8);

  pdf.save(buildViewerExportFilename(importName, "pdf", exportFiltered, exportSelected));
}

export async function exportViewerRowsToExcel({
  headers,
  rows,
  importName,
  exportFiltered,
  exportSelected,
}: ViewerExportParams) {
  if (rows.length === 0) return;

  const icPatterns = /^(ic|no\.?\s*kp|no\.?\s*ic|id\s*no|ic\s*no|no\s*pengenalan|kad\s*pengenalan)/i;
  const potentialIcColumns = headers.filter((header) => icPatterns.test(header.replace(/[_-]/g, " ")));

  const worksheetData = rows.map((row) => {
    const rowData: Record<string, string | number> = {};
    headers.forEach((header) => {
      const value = row[header];
      const stringValue = String(value || "");
      const isIcColumn = potentialIcColumns.includes(header);
      const looksLikeIc = /^\d{6,14}$/.test(stringValue.replace(/[-\s]/g, ""));

      if (isIcColumn || (looksLikeIc && stringValue.length >= 6)) {
        rowData[header] = stringValue;
      } else {
        rowData[header] = typeof value === "number" ? value : value == null ? "" : String(value);
      }
    });
    return rowData;
  });

  const XLSX = await loadViewerXlsxModule();
  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");

  for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
    const headerCell = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    const headerValue = worksheet[headerCell]?.v;
    const isIcColumn = potentialIcColumns.includes(headerValue);

    if (!isIcColumn) continue;

    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      if (worksheet[cellAddress]) {
        worksheet[cellAddress].t = "s";
        worksheet[cellAddress].z = "@";
      }
    }
  }

  worksheet["!cols"] = headers.map((header) => {
    const maxLength = Math.max(
      header.length,
      ...rows.slice(0, 100).map((row) => String(row[header] || "").length),
    );
    return { wch: Math.min(maxLength + 2, 50) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(
    workbook,
    buildViewerExportFilename(importName, "xlsx", exportFiltered, exportSelected),
  );
}
