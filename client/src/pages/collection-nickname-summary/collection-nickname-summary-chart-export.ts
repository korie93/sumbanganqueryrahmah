import { buildCsvContent, downloadCsv } from "@/lib/csv";
import { downloadBlob } from "@/lib/download";
import {
  getCollectionNicknamePerformanceLabel,
  getCollectionNicknamePerformanceLevel,
  type CollectionNicknameSummaryChartDatum,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";

const PNG_WIDTH = 1_600;
const PNG_MAX_RANKING_ROWS = 30;
const PNG_CHART_ROWS = 12;
const PNG_ROW_HEIGHT = 46;
const PDF_CHART_ROWS = 10;
const PDF_TABLE_ROW_HEIGHT = 7;

let nicknameChartJsPdfModulePromise: Promise<typeof import("jspdf")> | null = null;

export type CollectionNicknameSummaryExportContext = {
  fromDate?: string | undefined;
  toDate?: string | undefined;
  totalAmount: number;
  totalRecords: number;
};

function loadJsPdfModule() {
  if (!nicknameChartJsPdfModulePromise) {
    nicknameChartJsPdfModulePromise = import("jspdf").catch((error) => {
      nicknameChartJsPdfModulePromise = null;
      throw error;
    });
  }
  return nicknameChartJsPdfModulePromise;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(Math.max(0, value));
}

function formatPercentage(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

function normalizeExportText(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  }).join("").replace(/\s+/g, " ").trim();
}

function buildExportBaseFilename(context: CollectionNicknameSummaryExportContext): string {
  const from = String(context.fromDate || "").trim();
  const to = String(context.toDate || "").trim();
  const range = from && to ? `${from}-to-${to}` : new Date().toISOString().slice(0, 10);
  return `SQR-nickname-summary-${range}`;
}

function getPeakAmount(rows: readonly CollectionNicknameSummaryChartDatum[]): number {
  return rows.reduce((peak, row) => Math.max(peak, row.totalAmount), 0);
}

export function buildCollectionNicknameSummaryCsvContent(
  rows: readonly CollectionNicknameSummaryChartDatum[],
): string {
  const peakAmount = getPeakAmount(rows);
  return buildCsvContent(
    ["Rank", "Nickname", "Prestasi", "Jumlah Kutipan (MYR)", "Rekod", "Purata (MYR)", "Bahagian"],
    rows.map((row, index) => {
      const level = getCollectionNicknamePerformanceLevel(row, peakAmount);
      return [
        index + 1,
        normalizeExportText(row.nickname),
        getCollectionNicknamePerformanceLabel(level),
        row.totalAmount.toFixed(2),
        row.totalRecords,
        row.averagePerRecord.toFixed(2),
        formatPercentage(row.percentage),
      ];
    }),
  );
}

export function exportCollectionNicknameSummaryCsv(
  rows: readonly CollectionNicknameSummaryChartDatum[],
  context: CollectionNicknameSummaryExportContext,
): void {
  downloadCsv(
    buildCollectionNicknameSummaryCsvContent(rows),
    `${buildExportBaseFilename(context)}.csv`,
  );
}

function fitCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  const normalized = normalizeExportText(value);
  if (context.measureText(normalized).width <= maxWidth) {
    return normalized;
  }

  let low = 0;
  let high = normalized.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${normalized.slice(0, middle).trimEnd()}...`;
    if (context.measureText(candidate).width <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return `${normalized.slice(0, low).trimEnd()}...`;
}

function drawCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  options: {
    color?: string;
    font?: string;
    align?: CanvasTextAlign;
    maxWidth?: number;
  } = {},
): void {
  context.fillStyle = options.color ?? "#0f172a";
  context.font = options.font ?? "24px Arial, sans-serif";
  context.textAlign = options.align ?? "left";
  context.textBaseline = "alphabetic";
  const text = options.maxWidth ? fitCanvasText(context, value, options.maxWidth) : value;
  context.fillText(text, x, y);
}

function getPerformanceCanvasColor(level: ReturnType<typeof getCollectionNicknamePerformanceLevel>): string {
  if (level === "high") return "#047857";
  if (level === "medium") return "#a16207";
  return "#475569";
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Browser gagal menghasilkan fail PNG."));
    }, "image/png");
  });
}

export async function exportCollectionNicknameSummaryPng(
  rows: readonly CollectionNicknameSummaryChartDatum[],
  context: CollectionNicknameSummaryExportContext,
): Promise<void> {
  const rankingRows = rows.slice(0, PNG_MAX_RANKING_ROWS);
  const chartRows = rows.slice(0, PNG_CHART_ROWS);
  const rankingHeight = rankingRows.length * PNG_ROW_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = PNG_WIDTH;
  canvas.height = 780 + rankingHeight + (rows.length > rankingRows.length ? 60 : 0);

  try {
    const drawing = canvas.getContext("2d");
    if (!drawing) {
      throw new Error("Browser tidak menyokong penjanaan imej chart.");
    }

    drawing.fillStyle = "#ffffff";
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawCanvasText(drawing, "SQR Nickname Summary", 80, 92, {
      font: "bold 42px Arial, sans-serif",
    });
    drawCanvasText(
      drawing,
      context.fromDate && context.toDate
        ? `Tempoh: ${context.fromDate} hingga ${context.toDate}`
        : "Tempoh laporan semasa",
      80,
      132,
      { color: "#475569", font: "22px Arial, sans-serif" },
    );
    drawCanvasText(drawing, `Jumlah: ${formatMoney(context.totalAmount)}`, 80, 190, {
      font: "bold 25px Arial, sans-serif",
    });
    drawCanvasText(drawing, `Rekod: ${context.totalRecords.toLocaleString()}`, 580, 190, {
      font: "bold 25px Arial, sans-serif",
    });
    drawCanvasText(drawing, `Dipaparkan: ${rows.length} nickname`, 950, 190, {
      font: "bold 25px Arial, sans-serif",
    });

    drawCanvasText(drawing, "Perbandingan kutipan", 80, 255, {
      font: "bold 28px Arial, sans-serif",
    });
    const peakAmount = getPeakAmount(rows);
    chartRows.forEach((row, index) => {
      const y = 300 + index * 32;
      const level = getCollectionNicknamePerformanceLevel(row, peakAmount);
      const barWidth = peakAmount > 0 ? Math.max(4, (row.totalAmount / peakAmount) * 720) : 4;
      drawCanvasText(drawing, row.nickname, 80, y + 20, {
        font: "19px Arial, sans-serif",
        maxWidth: 300,
      });
      drawing.fillStyle = "#e2e8f0";
      drawing.fillRect(400, y, 720, 24);
      drawing.fillStyle = getPerformanceCanvasColor(level);
      drawing.fillRect(400, y, barWidth, 24);
      drawCanvasText(drawing, formatMoney(row.totalAmount), 1_160, y + 20, {
        font: "bold 18px Arial, sans-serif",
      });
      drawCanvasText(drawing, getCollectionNicknamePerformanceLabel(level), 1_480, y + 20, {
        color: getPerformanceCanvasColor(level),
        font: "bold 17px Arial, sans-serif",
        align: "right",
      });
    });

    const tableStartY = 720;
    drawCanvasText(drawing, "Ranking terperinci", 80, tableStartY - 24, {
      font: "bold 28px Arial, sans-serif",
    });
    drawing.fillStyle = "#e2e8f0";
    drawing.fillRect(80, tableStartY, 1_440, 40);
    const headers = [
      ["#", 100],
      ["Nickname", 160],
      ["Prestasi", 620],
      ["Kutipan", 820],
      ["Rekod", 1_090],
      ["Purata", 1_230],
      ["Bahagian", 1_500],
    ] as const;
    headers.forEach(([label, x]) => {
      drawCanvasText(drawing, label, x, tableStartY + 27, {
        color: "#334155",
        font: "bold 17px Arial, sans-serif",
        align: label === "Nickname" || label === "#" ? "left" : "right",
      });
    });

    rankingRows.forEach((row, index) => {
      const rowY = tableStartY + 40 + index * PNG_ROW_HEIGHT;
      if (index % 2 === 0) {
        drawing.fillStyle = "#f8fafc";
        drawing.fillRect(80, rowY, 1_440, PNG_ROW_HEIGHT);
      }
      const level = getCollectionNicknamePerformanceLevel(row, peakAmount);
      drawCanvasText(drawing, String(index + 1), 100, rowY + 30, { font: "17px Arial, sans-serif" });
      drawCanvasText(drawing, row.nickname, 160, rowY + 30, {
        font: "17px Arial, sans-serif",
        maxWidth: 390,
      });
      drawCanvasText(drawing, getCollectionNicknamePerformanceLabel(level), 620, rowY + 30, {
        color: getPerformanceCanvasColor(level),
        font: "bold 17px Arial, sans-serif",
        align: "right",
      });
      drawCanvasText(drawing, formatMoney(row.totalAmount), 820, rowY + 30, {
        font: "17px Arial, sans-serif",
        align: "right",
      });
      drawCanvasText(drawing, row.totalRecords.toLocaleString(), 1_090, rowY + 30, {
        font: "17px Arial, sans-serif",
        align: "right",
      });
      drawCanvasText(drawing, formatMoney(row.averagePerRecord), 1_230, rowY + 30, {
        font: "17px Arial, sans-serif",
        align: "right",
      });
      drawCanvasText(drawing, formatPercentage(row.percentage), 1_500, rowY + 30, {
        font: "17px Arial, sans-serif",
        align: "right",
      });
    });

    if (rows.length > rankingRows.length) {
      drawCanvasText(
        drawing,
        `${rows.length - rankingRows.length} baris tambahan tersedia dalam eksport PDF atau CSV.`,
        80,
        canvas.height - 28,
        { color: "#475569", font: "18px Arial, sans-serif" },
      );
    }

    const blob = await canvasToPngBlob(canvas);
    downloadBlob(blob, `${buildExportBaseFilename(context)}.png`);
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

function truncatePdfText(value: string, maxLength: number): string {
  const normalized = normalizeExportText(value);
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`
    : normalized;
}

export async function exportCollectionNicknameSummaryPdf(
  rows: readonly CollectionNicknameSummaryChartDatum[],
  context: CollectionNicknameSummaryExportContext,
): Promise<void> {
  const { default: jsPDF } = await loadJsPdfModule();
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const peakAmount = getPeakAmount(rows);

  const drawPageBase = (pageNumber: number) => {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.text("SQR Nickname Summary", margin, 17);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 7, { align: "right" });
  };

  drawPageBase(1);
  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text(
    context.fromDate && context.toDate
      ? `Tempoh: ${context.fromDate} hingga ${context.toDate}`
      : "Tempoh laporan semasa",
    margin,
    24,
  );
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.text(`Jumlah: ${formatMoney(context.totalAmount)}`, margin, 32);
  pdf.text(`Rekod: ${context.totalRecords.toLocaleString()}`, 80, 32);
  pdf.text(`Dipaparkan: ${rows.length} nickname`, 125, 32);

  pdf.setFontSize(11);
  pdf.text("Perbandingan kutipan", margin, 43);
  rows.slice(0, PDF_CHART_ROWS).forEach((row, index) => {
    const y = 50 + index * 9;
    const level = getCollectionNicknamePerformanceLevel(row, peakAmount);
    const ratio = peakAmount > 0 ? row.totalAmount / peakAmount : 0;
    const color = level === "high" ? [4, 120, 87] : level === "medium" ? [161, 98, 7] : [71, 85, 105];
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(truncatePdfText(row.nickname, 28), margin, y + 4);
    pdf.setFillColor(226, 232, 240);
    pdf.rect(63, y, 116, 5, "F");
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.rect(63, y, Math.max(1, 116 * ratio), 5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.text(formatMoney(row.totalAmount), 184, y + 4);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(getCollectionNicknamePerformanceLabel(level), 232, y + 4);
  });

  const headers = ["#", "Nickname", "Prestasi", "Kutipan", "Rekod", "Purata", "Bahagian"];
  const columnX = [margin, 24, 95, 129, 178, 204, 248];
  let pageNumber = 1;
  let y = 148;

  const drawTableHeader = () => {
    pdf.setFillColor(226, 232, 240);
    pdf.rect(margin, y, pageWidth - margin * 2, PDF_TABLE_ROW_HEIGHT, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(51, 65, 85);
    headers.forEach((header, index) => {
      pdf.text(header, columnX[index], y + 4.8);
    });
    y += PDF_TABLE_ROW_HEIGHT;
  };

  drawTableHeader();
  rows.forEach((row, index) => {
    if (y + PDF_TABLE_ROW_HEIGHT > pageHeight - 13) {
      pdf.addPage();
      pageNumber += 1;
      drawPageBase(pageNumber);
      y = 25;
      drawTableHeader();
    }
    if (index % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y, pageWidth - margin * 2, PDF_TABLE_ROW_HEIGHT, "F");
    }
    const level = getCollectionNicknamePerformanceLevel(row, peakAmount);
    const values = [
      String(index + 1),
      truncatePdfText(row.nickname, 34),
      getCollectionNicknamePerformanceLabel(level),
      formatMoney(row.totalAmount),
      row.totalRecords.toLocaleString(),
      formatMoney(row.averagePerRecord),
      formatPercentage(row.percentage),
    ];
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.2);
    pdf.setTextColor(15, 23, 42);
    values.forEach((value, valueIndex) => {
      pdf.text(value, columnX[valueIndex], y + 4.8);
    });
    y += PDF_TABLE_ROW_HEIGHT;
  });

  downloadBlob(pdf.output("blob"), `${buildExportBaseFilename(context)}.pdf`);
}
