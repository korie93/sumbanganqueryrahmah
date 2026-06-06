import { downloadViewerRowsAsCsv } from "@/pages/viewer/utils";
import type { DataRowWithId } from "@/pages/viewer/types";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import {
  buildViewerExportFilename,
  chunkViewerPdfHeaders,
  loadViewerJsPdfModule,
  loadViewerXlsxModule,
  resolveViewerPotentialIcColumns,
} from "@/pages/viewer/export-file-utils";
import {
  buildViewerWorksheetColumns,
  buildViewerWorksheetData,
} from "@/pages/viewer/excel-export-utils";

interface ViewerExportParams {
  headers: string[];
  rows: DataRowWithId[];
  importName: string;
  exportFiltered?: boolean;
  exportSelected?: boolean;
}

type WorksheetCell = {
  v?: unknown;
  t?: string;
  z?: string;
};

function getWorksheetCell(worksheet: Record<string, unknown>, address: string): WorksheetCell | undefined {
  const value = worksheet[address];
  return typeof value === "object" && value !== null ? (value as WorksheetCell) : undefined;
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
  if (rows.length === 0 || headers.length === 0) return;

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
  const headerChunks = chunkViewerPdfHeaders(headers, maxColsPerPage);
  const generatedAt = formatDateTimeDDMMYYYY(new Date(), { includeSeconds: true });
  let yPos = margin;
  let pageNumber = 1;
  let isFirstPdfPage = true;

  const truncateText = (text: string, maxLength: number) =>
    text.length <= maxLength ? text : `${text.substring(0, maxLength - 2)}..`;

  const resolveTableLayout = (columnCount: number) => {
    const safeColumnCount = Math.max(1, columnCount);
    const fontSize = safeColumnCount > 8 ? 6 : safeColumnCount > 5 ? 7 : 8;
    const rowHeight = fontSize <= 6 ? 5 : 6;
    const colWidth = tableWidth / safeColumnCount;
    const maxCharsPerCol = Math.max(3, Math.floor((colWidth - 2) / (fontSize * 0.35)));
    const maxRowsPerPage = Math.max(1, Math.floor((pageHeight - margin - 25) / rowHeight));

    return {
      colWidth,
      fontSize,
      maxCharsPerCol,
      maxRowsPerPage,
      rowHeight,
    };
  };

  const drawBackground = () => {
    pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
  };

  const drawFooter = () => {
    pdf.setFontSize(8);
    pdf.setTextColor(isDark ? 120 : 150);
    pdf.text(`Page ${pageNumber}`, pageWidth - margin - 15, pageHeight - 8);
    pdf.text("SQR System", margin, pageHeight - 8);
  };

  const drawReportHeader = (chunkIndex: number) => {
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

    const columnRangeLabel =
      headerChunks.length > 1
        ? ` | Columns ${chunkIndex * maxColsPerPage + 1}-${Math.min((chunkIndex + 1) * maxColsPerPage, headers.length)} of ${headers.length}`
        : "";
    pdf.text(
      `${exportType} | ${rows.length} rows${columnRangeLabel} | ${generatedAt}`,
      margin,
      yPos,
    );
    yPos += 6;

    pdf.setDrawColor(isDark ? 100 : 200);
    pdf.setLineWidth(0.3);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 4;
  };

  const drawTableHeader = (
    headersForPage: string[],
    layout: ReturnType<typeof resolveTableLayout>,
  ) => {
    pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
    pdf.rect(margin, yPos, tableWidth, layout.rowHeight, "F");
    pdf.setFontSize(layout.fontSize);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(isDark ? 255 : 30);
    headersForPage.forEach((header, index) => {
      const xPos = margin + index * layout.colWidth + 1;
      pdf.text(
        truncateText(header, layout.maxCharsPerCol),
        xPos,
        yPos + layout.rowHeight - 1.5,
      );
    });
    yPos += layout.rowHeight;
  };

  const startPdfPage = (
    chunkIndex: number,
    headersForPage: string[],
    layout: ReturnType<typeof resolveTableLayout>,
  ) => {
    if (!isFirstPdfPage) {
      pdf.addPage();
      pageNumber += 1;
    }
    isFirstPdfPage = false;
    yPos = margin;
    drawBackground();
    drawReportHeader(chunkIndex);
    drawTableHeader(headersForPage, layout);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(layout.fontSize);
  };

  headerChunks.forEach((headersForPage, chunkIndex) => {
    const layout = resolveTableLayout(headersForPage.length);
    let rowsOnPage = 0;

    startPdfPage(chunkIndex, headersForPage, layout);

    rows.forEach((row, rowIndex) => {
      if (rowsOnPage >= layout.maxRowsPerPage - 1) {
        drawFooter();
        pdf.addPage();
        pageNumber += 1;
        yPos = margin;
        rowsOnPage = 0;
        drawBackground();
        drawReportHeader(chunkIndex);
        drawTableHeader(headersForPage, layout);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(layout.fontSize);
      }

      if (rowIndex % 2 === 0) {
        pdf.setFillColor(isDark ? 40 : 245, isDark ? 50 : 245, isDark ? 60 : 250);
        pdf.rect(margin, yPos, tableWidth, layout.rowHeight, "F");
      }

      pdf.setTextColor(isDark ? 220 : 50);
      headersForPage.forEach((header, index) => {
        const xPos = margin + index * layout.colWidth + 1;
        const cellValue = String(row[header] ?? "");
        pdf.text(
          truncateText(cellValue, layout.maxCharsPerCol),
          xPos,
          yPos + layout.rowHeight - 1.5,
        );
      });

      yPos += layout.rowHeight;
      rowsOnPage += 1;
    });

    drawFooter();
  });

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

  const potentialIcColumns = resolveViewerPotentialIcColumns(headers);
  const worksheetData = buildViewerWorksheetData(headers, rows, potentialIcColumns);

  const XLSX = await loadViewerXlsxModule();
  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");

  for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
    const headerCell = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    const headerValue = getWorksheetCell(worksheet, headerCell)?.v;
    const isIcColumn = typeof headerValue === "string" && potentialIcColumns.includes(headerValue);

    if (!isIcColumn) continue;

    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = getWorksheetCell(worksheet, cellAddress);
      if (cell) {
        cell.t = "s";
        cell.z = "@";
      }
    }
  }

  worksheet["!cols"] = buildViewerWorksheetColumns(headers, rows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(
    workbook,
    buildViewerExportFilename(importName, "xlsx", exportFiltered, exportSelected),
  );
}
