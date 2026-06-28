import { buildCsvContent, downloadCsv } from "@/lib/csv";
import { downloadBlob } from "@/lib/download";
import {
  getCollectionNicknameBenchmarkGap,
  getCollectionNicknameBenchmarkProgress,
  getCollectionNicknameBenchmarkStatus,
  getCollectionNicknameBenchmarkStatusLabel,
  getCollectionNicknamePerformanceLabel,
  type CollectionNicknamePerformanceLevel,
  getCollectionNicknameTargetAwarePerformanceLevel,
  type CollectionNicknameSummaryChartDatum,
  type CollectionNicknameSummaryChartMetric,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-utils";
import {
  buildCollectionNicknameSummaryMetricData,
  type CollectionNicknameSummaryMetricDatum,
} from "@/pages/collection-nickname-summary/collection-nickname-summary-chart-metrics";
import {
  getCollectionNicknameTargetEvaluationAmount,
  getCollectionNicknameTargetBenchmark,
  isCollectionNicknameTargetBenchmarkComplete,
  type CollectionNicknameTargetBenchmark,
} from "@/pages/collection-nickname-summary/collection-nickname-target-benchmarks";
import {
  buildCollectionNicknameTargetMissingMonthText,
  buildCollectionNicknameTargetMonthExportText,
} from "@/pages/collection-nickname-summary/collection-nickname-target-audit";
import { appendCollectionNicknameTargetAuditPages } from "@/pages/collection-nickname-summary/collection-nickname-target-pdf-audit";

const PNG_WIDTH = 1_600;
const PNG_MAX_RANKING_ROWS = 30;
const PNG_CHART_ROWS = 12;
const PNG_ROW_HEIGHT = 46;
const PDF_CHART_ROWS = 10;
const PDF_TABLE_ROW_HEIGHT = 7;
const TARGET_EXPORT_STROKE = "#b91c1c";

let nicknameChartJsPdfModulePromise: Promise<typeof import("jspdf")> | null = null;

export type CollectionNicknameSummaryExportContext = {
  fromDate?: string | undefined;
  metric?: CollectionNicknameSummaryChartMetric | undefined;
  targetBenchmarks?: ReadonlyMap<string, CollectionNicknameTargetBenchmark> | undefined;
  targetStatusNote?: string | undefined;
  toDate?: string | undefined;
  totalAmount: number;
  totalRecords: number;
};

type CollectionNicknameSummaryExportTarget = {
  amount: number;
  benchmark: CollectionNicknameTargetBenchmark;
  complete: boolean;
  configuredAmount: number;
  gap: number;
  progress: number;
  statusLabel: string;
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

function getExportMetric(
  context: CollectionNicknameSummaryExportContext,
): CollectionNicknameSummaryChartMetric {
  return context.metric ?? "amount";
}

function getExportChartTitle(metric: CollectionNicknameSummaryChartMetric): string {
  if (metric === "progress") return "Progress terhadap target (100%)";
  if (metric === "gap") return "Jurang untuk capai target";
  return "Perbandingan kutipan vs target";
}

function getExportChartScale(
  rows: readonly CollectionNicknameSummaryMetricDatum[],
  metric: CollectionNicknameSummaryChartMetric,
): number {
  return rows.reduce((peak, row) => {
    const targetValue = metric === "amount" ? row.targetAmount ?? 0 : 0;
    const progressTarget = metric === "progress" ? 100 : 0;
    return Math.max(peak, row.chartValue, targetValue, progressTarget);
  }, 0);
}

function formatExportChartValue(
  row: CollectionNicknameSummaryMetricDatum,
  metric: CollectionNicknameSummaryChartMetric,
): string {
  if (metric === "progress") {
    return row.targetAmount ? `${Math.min(row.chartValue, 999.9).toFixed(1)}%` : "Tiada target";
  }
  if (metric === "gap") {
    if (!row.targetAmount) return "Tiada target";
    return row.chartValue > 0 ? formatMoney(row.chartValue) : "Capai";
  }
  return formatMoney(row.totalAmount);
}

function getExportTarget(
  row: CollectionNicknameSummaryChartDatum,
  context: CollectionNicknameSummaryExportContext,
): CollectionNicknameSummaryExportTarget {
  const benchmark = getCollectionNicknameTargetBenchmark(
    context.targetBenchmarks,
    row.nickname,
  );
  const complete = isCollectionNicknameTargetBenchmarkComplete(benchmark);
  const benchmarkAmount = getCollectionNicknameTargetEvaluationAmount(benchmark);
  const progress = getCollectionNicknameBenchmarkProgress(row, benchmarkAmount);
  const gap = getCollectionNicknameBenchmarkGap(row, benchmarkAmount);
  const status = getCollectionNicknameBenchmarkStatus(row, benchmarkAmount);
  return {
    amount: benchmarkAmount,
    benchmark,
    complete,
    configuredAmount: benchmark.amount,
    gap,
    progress,
    statusLabel: getCollectionNicknameBenchmarkStatusLabel(status),
  };
}

function getExportPerformanceLabel(
  row: CollectionNicknameSummaryChartDatum,
  context: CollectionNicknameSummaryExportContext,
  peakAmount: number,
): string {
  const targetAmount = getExportTarget(row, context).amount;
  return getCollectionNicknamePerformanceLabel(
    getCollectionNicknameTargetAwarePerformanceLevel(row, peakAmount, targetAmount),
  );
}

export function buildCollectionNicknameSummaryCsvContent(
  rows: readonly CollectionNicknameSummaryChartDatum[],
  context: CollectionNicknameSummaryExportContext = {
    totalAmount: 0,
    totalRecords: 0,
  },
): string {
  const peakAmount = getPeakAmount(rows);
  return buildCsvContent(
    [
      "Rank",
      "Nickname",
      "Prestasi",
      "Jumlah Kutipan (MYR)",
      "Target (MYR)",
      "Status Target",
      "Progress Target",
      "Jurang Target (MYR)",
      "Pecahan Bulan Target",
      "Bulan Tanpa Target",
      "Target Dikemas Kini Oleh",
      "Target Dikemas Kini Pada",
      "Rekod",
      "Purata (MYR)",
      "Bahagian",
    ],
    rows.map((row, index) => {
      const target = getExportTarget(row, context);
      return [
        index + 1,
        normalizeExportText(row.nickname),
        getExportPerformanceLabel(row, context, peakAmount),
        row.totalAmount.toFixed(2),
        target.benchmark.configuredMonths > 0 ? target.configuredAmount.toFixed(2) : "",
        target.complete && target.amount > 0
          ? target.statusLabel
          : target.benchmark.requestedMonths > 0 && !target.complete
            ? "Target tidak lengkap"
            : "Tiada target",
        target.amount > 0 ? formatPercentage(Math.min(target.progress, 999.9)) : "",
        target.amount > 0 ? target.gap.toFixed(2) : "",
        buildCollectionNicknameTargetMonthExportText(target.benchmark),
        buildCollectionNicknameTargetMissingMonthText(target.benchmark),
        target.benchmark.latestUpdatedBy || "",
        target.benchmark.latestUpdatedAt || "",
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
    buildCollectionNicknameSummaryCsvContent(rows, context),
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

function getPerformanceCanvasColor(level: CollectionNicknamePerformanceLevel): string {
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
  const metric = getExportMetric(context);
  const chartRows = buildCollectionNicknameSummaryMetricData(
    rows.slice(0, PNG_CHART_ROWS),
    context.targetBenchmarks,
    metric,
  );
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
    if (context.targetStatusNote) {
      drawCanvasText(drawing, context.targetStatusNote, 80, 225, {
        color: "#475569",
        font: "19px Arial, sans-serif",
        maxWidth: 1_360,
      });
    }

    drawCanvasText(drawing, getExportChartTitle(metric), 80, 255, {
      font: "bold 28px Arial, sans-serif",
    });
    const peakAmount = getPeakAmount(rows);
    const chartScale = getExportChartScale(chartRows, metric);
    chartRows.forEach((row, index) => {
      const y = 300 + index * 32;
      const target = getExportTarget(row, context);
      const level = getCollectionNicknameTargetAwarePerformanceLevel(row, peakAmount, target.amount);
      const barWidth = chartScale > 0 && row.chartValue > 0
        ? Math.max(4, (row.chartValue / chartScale) * 720)
        : 0;
      drawCanvasText(drawing, row.nickname, 80, y + 20, {
        font: "19px Arial, sans-serif",
        maxWidth: 300,
      });
      drawing.fillStyle = "#e2e8f0";
      drawing.fillRect(400, y, 720, 24);
      if (metric === "amount" && target.amount > 0) {
        const targetWidth = Math.max(4, (target.amount / chartScale) * 720);
        drawing.strokeStyle = TARGET_EXPORT_STROKE;
        drawing.lineWidth = 2;
        drawing.setLineDash([7, 5]);
        drawing.strokeRect(400, y, targetWidth, 24);
        drawing.setLineDash([]);
      }
      if (metric === "progress" && row.targetAmount && chartScale > 0) {
        const targetX = 400 + (100 / chartScale) * 720;
        drawing.strokeStyle = TARGET_EXPORT_STROKE;
        drawing.lineWidth = 2;
        drawing.setLineDash([7, 5]);
        drawing.beginPath();
        drawing.moveTo(targetX, y - 2);
        drawing.lineTo(targetX, y + 26);
        drawing.stroke();
        drawing.setLineDash([]);
      }
      drawing.fillStyle = getPerformanceCanvasColor(level);
      if (barWidth > 0) {
        drawing.fillRect(400, y, barWidth, 24);
      }
      drawCanvasText(drawing, formatExportChartValue(row, metric), 1_160, y + 20, {
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
      ["Prestasi", 520],
      ["Target", 710],
      ["Status", 890],
      ["Kutipan", 1_050],
      ["Rekod", 1_225],
      ["Purata", 1_355],
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
      const target = getExportTarget(row, context);
      const level = getCollectionNicknameTargetAwarePerformanceLevel(row, peakAmount, target.amount);
      drawCanvasText(drawing, String(index + 1), 100, rowY + 30, { font: "17px Arial, sans-serif" });
      drawCanvasText(drawing, row.nickname, 160, rowY + 30, {
        font: "17px Arial, sans-serif",
        maxWidth: 300,
      });
      drawCanvasText(drawing, getCollectionNicknamePerformanceLabel(level), 520, rowY + 30, {
        color: getPerformanceCanvasColor(level),
        font: "bold 17px Arial, sans-serif",
        align: "right",
      });
      drawCanvasText(drawing, target.benchmark.configuredMonths > 0 ? formatMoney(target.configuredAmount) : "-", 710, rowY + 30, {
        font: "17px Arial, sans-serif",
        align: "right",
      });
      drawCanvasText(drawing, target.complete && target.amount > 0
        ? target.statusLabel
        : target.benchmark.requestedMonths > 0 && !target.complete
          ? "Tidak lengkap"
          : "Tiada target", 890, rowY + 30, {
        font: "17px Arial, sans-serif",
        align: "right",
        maxWidth: 145,
      });
      drawCanvasText(drawing, formatMoney(row.totalAmount), 1_050, rowY + 30, {
        font: "17px Arial, sans-serif",
        align: "right",
      });
      drawCanvasText(drawing, row.totalRecords.toLocaleString(), 1_225, rowY + 30, {
        font: "17px Arial, sans-serif",
        align: "right",
      });
      drawCanvasText(drawing, formatMoney(row.averagePerRecord), 1_355, rowY + 30, {
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
  const metric = getExportMetric(context);
  const chartRows = buildCollectionNicknameSummaryMetricData(
    rows.slice(0, PDF_CHART_ROWS),
    context.targetBenchmarks,
    metric,
  );

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
  if (context.targetStatusNote) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(truncatePdfText(context.targetStatusNote, 150), margin, 38);
  }

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(15, 23, 42);
  pdf.text(getExportChartTitle(metric), margin, 45);
  const chartScale = getExportChartScale(chartRows, metric);
  chartRows.forEach((row, index) => {
    const y = 52 + index * 9;
    const target = getExportTarget(row, context);
    const level = getCollectionNicknameTargetAwarePerformanceLevel(row, peakAmount, target.amount);
    const ratio = chartScale > 0 ? row.chartValue / chartScale : 0;
    const color = level === "high" ? [4, 120, 87] : level === "medium" ? [161, 98, 7] : [71, 85, 105];
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(truncatePdfText(row.nickname, 28), margin, y + 4);
    pdf.setFillColor(226, 232, 240);
    pdf.rect(63, y, 116, 5, "F");
    if (metric === "amount" && target.amount > 0) {
      const targetRatio = chartScale > 0 ? target.amount / chartScale : 0;
      pdf.setDrawColor(185, 28, 28);
      pdf.setLineWidth(0.35);
      pdf.rect(63, y, Math.max(1, 116 * targetRatio), 5, "S");
    }
    if (metric === "progress" && row.targetAmount && chartScale > 0) {
      const targetX = 63 + (100 / chartScale) * 116;
      pdf.setDrawColor(185, 28, 28);
      pdf.setLineWidth(0.35);
      pdf.line(targetX, y - 0.5, targetX, y + 5.5);
    }
    pdf.setFillColor(color[0], color[1], color[2]);
    if (ratio > 0) {
      pdf.rect(63, y, Math.max(1, 116 * ratio), 5, "F");
    }
    pdf.setFont("helvetica", "bold");
    pdf.text(formatExportChartValue(row, metric), 184, y + 4);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(getCollectionNicknamePerformanceLabel(level), 232, y + 4);
  });

  const headers = ["#", "Nickname", "Prestasi", "Target", "Status", "Kutipan", "Rekod", "Purata", "Bahagian"];
  const columnX = [margin, 24, 82, 109, 136, 166, 205, 225, 252];
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
    const target = getExportTarget(row, context);
    const level = getCollectionNicknameTargetAwarePerformanceLevel(row, peakAmount, target.amount);
    const values = [
      String(index + 1),
      truncatePdfText(row.nickname, 27),
      getCollectionNicknamePerformanceLabel(level),
      target.benchmark.configuredMonths > 0 ? formatMoney(target.configuredAmount) : "-",
      target.complete && target.amount > 0
        ? `${target.statusLabel} (${formatPercentage(Math.min(target.progress, 999.9))})`
        : target.benchmark.requestedMonths > 0 && !target.complete
          ? "Target tidak lengkap"
          : "Tiada target",
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

  appendCollectionNicknameTargetAuditPages({
    drawPageBase,
    margin,
    pageHeight,
    pageNumber,
    pdf,
    rows,
    targetBenchmarks: context.targetBenchmarks,
    truncateText: truncatePdfText,
  });

  downloadBlob(pdf.output("blob"), `${buildExportBaseFilename(context)}.pdf`);
}
