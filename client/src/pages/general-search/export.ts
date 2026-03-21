import jsPDF from "jspdf";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import type { SearchResultRow } from "@/pages/general-search/types";
import { getCellDisplayText } from "@/pages/general-search/utils";

interface ExportSearchResultsToPdfParams {
  advancedMode: boolean;
  activeFiltersCount: number;
  headers: string[];
  query: string;
  results: SearchResultRow[];
}

export async function exportSearchResultsToPdf({
  advancedMode,
  activeFiltersCount,
  headers,
  query,
  results,
}: ExportSearchResultsToPdfParams) {
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const pdf = new jsPDF({
    orientation: headers.length > 5 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const rowHeight = 7;
  const colWidth = (pageWidth - margin * 2) / headers.length;
  const maxRowsPerPage = Math.floor((pageHeight - margin - 26) / rowHeight);
  let yPos = margin;
  let rowsOnPage = 0;
  let pageNumber = 1;

  const drawPageBackground = () => {
    pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
  };

  const drawHeaderRow = () => {
    pdf.setFillColor(isDark ? 50 : 230, isDark ? 60 : 230, isDark ? 70 : 235);
    pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(isDark ? 255 : 30);
    headers.forEach((header, index) => {
      const text = header.length > 15 ? `${header.substring(0, 12)}...` : header;
      pdf.text(text, margin + index * colWidth + 2, yPos + 5);
    });
    yPos += rowHeight;
  };

  drawPageBackground();
  pdf.setFontSize(18);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(isDark ? 255 : 30);
  pdf.text("Search Results Report", margin, yPos + 6);
  yPos += 12;

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(isDark ? 180 : 100);
  const searchInfo = advancedMode
    ? `Advanced Search (${activeFiltersCount} filters)`
    : `Search: "${query}"`;
  pdf.text(
    `${searchInfo} | ${results.length} results | Generated: ${formatDateTimeDDMMYYYY(new Date(), { includeSeconds: true })}`,
    margin,
    yPos,
  );
  yPos += 8;

  pdf.setDrawColor(isDark ? 100 : 200);
  pdf.setLineWidth(0.5);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 6;

  drawHeaderRow();
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);

  results.forEach((row, rowIndex) => {
    if (rowsOnPage >= maxRowsPerPage - 1) {
      pdf.setFontSize(8);
      pdf.setTextColor(isDark ? 120 : 150);
      pdf.text(`Page ${pageNumber}`, pageWidth - margin - 15, pageHeight - 8);
      pdf.text("SQR System", margin, pageHeight - 8);

      pdf.addPage();
      pageNumber += 1;
      yPos = margin;
      rowsOnPage = 0;

      drawPageBackground();
      drawHeaderRow();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
    }

    if (rowIndex % 2 === 0) {
      pdf.setFillColor(isDark ? 40 : 245, isDark ? 50 : 245, isDark ? 60 : 250);
      pdf.rect(margin, yPos, pageWidth - margin * 2, rowHeight, "F");
    }

    pdf.setTextColor(isDark ? 220 : 50);
    headers.forEach((header, index) => {
      const cellValue = getCellDisplayText(row[header]);
      const maxChars = Math.floor(colWidth / 2);
      const text =
        cellValue.length > maxChars
          ? `${cellValue.substring(0, maxChars - 2)}..`
          : cellValue;
      pdf.text(text, margin + index * colWidth + 2, yPos + 5);
    });
    yPos += rowHeight;
    rowsOnPage += 1;
  });

  pdf.setFontSize(8);
  pdf.setTextColor(isDark ? 120 : 150);
  pdf.text(`Page ${pageNumber}`, pageWidth - margin - 15, pageHeight - 8);
  pdf.text("SQR System", margin, pageHeight - 8);
  pdf.save(`SQR-search-results-${new Date().toISOString().split("T")[0]}.pdf`);
}
