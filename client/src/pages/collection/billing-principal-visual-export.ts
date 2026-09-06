import type { BillingPrincipalVisualExportDataset } from "@/lib/api/collection-billing-principal";
import { formatOspCurrency, formatOspPercentage, formatOspPercentagePoint } from "./billing-principal-report-utils";
import { getBillingPrincipalReportingWindow } from "@/lib/billing-principal-date-domain";

export type BillingPrincipalVisualExportKind = "png" | "pdf";
export type BillingPrincipalVisualExportSection = { title: string; headers: string[]; rows: string[][] };
type VisualExportInput = { dataset: BillingPrincipalVisualExportDataset; signal?: AbortSignal; beforeDownload: () => Promise<void> };

const WIDTH = 2400;
const MIN_HEIGHT = 1100;
const MARGIN = 48;
const MIN_ROW_HEIGHT = 42;
const CELL_LINE_HEIGHT = 19;
const CELL_VERTICAL_PADDING = 12;
const ROWS_PER_PAGE = 12;
// At most 366 daily rows plus shared/private summaries. Render one canvas at a
// time, and yield between pages so cancellation can be delivered by the UI.
const MAX_PAGES = 120;

function withAll<T extends { aging: string }, U extends { aging: string }>(rows: readonly T[], all: U): Array<T | U> {
  return [...rows, all];
}

function nonEmpty(headers: string[], rows: string[][]) {
  return rows.length ? rows : [["No data", ...headers.slice(1).map(() => "—")]];
}

export function buildBillingPrincipalVisualExportSections(dataset: BillingPrincipalVisualExportDataset): BillingPrincipalVisualExportSection[] {
  const { overview } = dataset;
  const revision = overview.revision;
  const reportingWindow = getBillingPrincipalReportingWindow(revision);
  const systemRows = withAll(overview.systemResult.rows, overview.systemResult.all).map((row) => [
    row.aging,
    formatOspCurrency(row.totalOsp),
    formatOspPercentage(row.targetPercentage),
    formatOspCurrency(row.targetOsp),
    formatOspPercentage(row.resultPercentage),
    formatOspCurrency(row.ospClosed),
    String(row.closedAccountCount),
    formatOspCurrency(row.balanceOsp),
  ]);
  const clientRows = withAll(overview.clientResult.rows, overview.clientResult.all).map((row) => [
    row.aging,
    formatOspCurrency(row.totalOsp),
    formatOspPercentage(row.targetPercentage),
    formatOspCurrency(row.targetOsp),
    row.receivedDate ? formatOspPercentage(row.resultPercentage) : "—",
    row.receivedDate ? formatOspCurrency(row.ospClosed) : "—",
    row.receivedDate ? formatOspCurrency(row.balanceOsp) : "—",
  ]);
  const comparison = overview.latestComparison;
  const comparisonRows = [
    ["System ALL", comparison.system.asOf, formatOspCurrency(comparison.system.totalOsp), formatOspCurrency(comparison.system.ospClosed), formatOspPercentage(comparison.system.resultPercentage)],
    ["Client ALL", comparison.client?.receivedDate ?? "—", comparison.client ? formatOspCurrency(comparison.client.totalOsp) : "—", comparison.client ? formatOspCurrency(comparison.client.ospClosed) : "—", comparison.client ? formatOspPercentage(comparison.client.resultPercentage) : "—"],
    ["Difference", "Latest vs latest", "—", "—", comparison.differencePercentagePoints == null ? "—" : formatOspPercentagePoint(comparison.differencePercentagePoints)],
  ];
  const calendarRows = dataset.calendar.map((day) => [
    day.date,
    day.aging,
    formatOspCurrency(day.totalOsp),
    formatOspCurrency(day.targetOsp),
    formatOspCurrency(day.systemOspClosedToday),
    formatOspCurrency(day.systemCumulativeOspClosed),
    formatOspPercentage(day.systemResultPercentage),
    formatOspPercentage(day.systemPreviousResultPercentage),
    formatOspPercentagePoint(day.systemDailyMovementPercentagePoints),
    formatOspPercentage(day.systemAchievementVsTargetPercentage),
    String(day.systemDailyAccounts),
    formatOspCurrency(day.balanceOsp),
  ]);
  return [
    { title: "Metadata", headers: ["Field", "Value"], rows: [
      ["Target", overview.target.name], ["Revision", String(revision.revisionNumber)], ["System as of", overview.asOf],
      [reportingWindow.sourceValidityVerified ? "Source validity" : "Reporting period (includes legacy source fallback)", `${reportingWindow.from} to ${reportingWindow.to}`],
      ["Assigned admin", overview.target.assignedAdmin ? `${overview.target.assignedAdmin.username} — ${overview.target.assignedAdmin.fullName ?? ""}` : "Legacy — unassigned"],
      ["Private client owner", dataset.generatedBy],
      ["Private client state", overview.clientResult.all.receivedDate ? "Saved to your account" : "Unsaved — defaults from TABLE A"],
      ["Aging", revision.agingScope.join(", ")],
      ["Balance formula", "Target OSP minus closed OSP; negative values retained"],
      ["Sources", revision.sourceSnapshots.map((source) => source.filename ? `${source.name} (${source.filename})` : source.name).join("; ")],
      ["Generated", `${dataset.generatedAt} by ${dataset.generatedBy}`],
    ] },
    { title: "Table A - System Result", headers: ["Aging", "TT OSP", "Target %", "Target OSP", "Result %", "OSP Closed", "Accounts", "Balance OSP"], rows: systemRows },
    { title: "Table B - Client Result", headers: ["Aging", "TT OSP", "Private Target %", "Target OSP", "Client Result %", "Client OSP Closed", "Balance OSP"], rows: clientRows },
    { title: "Latest Total Result Comparison", headers: ["Dataset", "Date", "TT OSP", "OSP Closed", "Result / Difference"], rows: comparisonRows },
    { title: "Table A - Daily Movement", headers: ["Date", "Aging", "TT OSP", "Target OSP", "New closed", "Cumulative", "Result %", "Previous %", "Move pp", "Achievement", "Accounts", "Balance OSP"], rows: nonEmpty(["Date", "Aging", "TT OSP", "Target OSP", "New closed", "Cumulative", "Result %", "Previous %", "Move pp", "Achievement", "Accounts", "Balance OSP"], calendarRows) },
  ];
}

function abortIfRequested(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("The export was cancelled.", "AbortError");
}

export function buildBillingPrincipalVisualPages(dataset: BillingPrincipalVisualExportDataset) {
  const pages = buildBillingPrincipalVisualExportSections(dataset).flatMap((section) => {
    const chunks: BillingPrincipalVisualExportSection[] = [];
    for (let index = 0; index < section.rows.length || index === 0; index += ROWS_PER_PAGE) {
      chunks.push({ ...section, title: section.rows.length > ROWS_PER_PAGE ? `${section.title} (${Math.floor(index / ROWS_PER_PAGE) + 1})` : section.title, rows: section.rows.slice(index, index + ROWS_PER_PAGE) });
    }
    return chunks;
  });
  if (pages.length > MAX_PAGES) throw new Error("Visual export is too large. Narrow the date or aging scope, or use Excel.");
  return pages;
}

export function isBillingPrincipalVisualNumericColumn(section: BillingPrincipalVisualExportSection, column: number): boolean {
  if (section.title.startsWith("Table A - Daily Movement")) return column >= 2;
  if (section.title.startsWith("Table A - System") || section.title.startsWith("Table B - Client")) return column >= 1;
  return section.title === "Latest Total Result Comparison" && column >= 2;
}

export async function yieldBillingPrincipalExport(signal?: AbortSignal): Promise<void> {
  abortIfRequested(signal);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  abortIfRequested(signal);
}

export function wrapBillingPrincipalVisualText(
  value: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  const safeWidth = Math.max(1, width);
  return String(value).split(/\r?\n/).flatMap((paragraph) => {
    if (!paragraph) return [""];
    const lines: string[] = [];
    let current = "";
    for (const character of Array.from(paragraph)) {
      const candidate = `${current}${character}`;
      if (current && measure(candidate) > safeWidth) {
        lines.push(current);
        current = character;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
    return lines;
  });
}

function renderPage(dataset: BillingPrincipalVisualExportDataset, section: BillingPrincipalVisualExportSection, page: number, pages: number) {
  const scale = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create the report image.");
  const tableTop = 140;
  const tableWidth = WIDTH - MARGIN * 2;
  const columnWidth = tableWidth / Math.max(1, section.headers.length);
  const prepareRow = (cells: string[], bold = false) => {
    context.font = bold ? "700 14px Arial" : "14px Arial";
    const wrappedCells = cells.map((cell) => wrapBillingPrincipalVisualText(
      String(cell),
      columnWidth - 14,
      (text) => context.measureText(text).width,
    ));
    const lineCount = Math.max(1, ...wrappedCells.map((lines) => lines.length));
    return {
      bold,
      cells: wrappedCells,
      height: Math.max(MIN_ROW_HEIGHT, lineCount * CELL_LINE_HEIGHT + CELL_VERTICAL_PADDING),
    };
  };
  const preparedRows = [
    prepareRow(section.headers, true),
    ...section.rows.map((row) => prepareRow(row)),
  ];
  const tableHeight = preparedRows.reduce((total, row) => total + row.height, 0);
  const height = Math.max(MIN_HEIGHT, tableTop + tableHeight + 70);
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  context.scale(scale, scale); context.fillStyle = "#ffffff"; context.fillRect(0, 0, WIDTH, height);
  context.fillStyle = "#0f172a"; context.font = "700 28px Arial"; context.fillText("SQR Billing Principal", MARGIN, 45);
  context.font = "700 18px Arial"; context.fillText(section.title, MARGIN, 82);
  context.font = "14px Arial"; context.fillStyle = "#475569"; context.fillText(`${dataset.overview.target.name} · System as of ${dataset.overview.asOf} · revision ${dataset.overview.revision.revisionNumber}`, MARGIN, 112);
  let y = tableTop;
  preparedRows.forEach((row, rowIndex) => {
    context.fillStyle = row.bold ? "#e2e8f0" : rowIndex % 2 ? "#ffffff" : "#f8fafc"; context.fillRect(MARGIN, y, tableWidth, row.height);
    context.strokeStyle = "#cbd5e1"; context.strokeRect(MARGIN, y, tableWidth, row.height);
    row.cells.forEach((lines, column) => {
      const x = MARGIN + column * columnWidth;
      if (column) { context.beginPath(); context.moveTo(x, y); context.lineTo(x, y + row.height); context.stroke(); }
      context.fillStyle = "#0f172a"; context.font = row.bold ? "700 14px Arial" : "14px Arial";
      const numeric = isBillingPrincipalVisualNumericColumn(section, column);
      context.textAlign = numeric ? "right" : "left";
      lines.forEach((line, lineIndex) => context.fillText(
        line,
        numeric ? x + columnWidth - 7 : x + 7,
        y + 8 + CELL_LINE_HEIGHT * (lineIndex + 1) - 4,
      ));
    });
    y += row.height;
  });
  context.textAlign = "left";
  context.fillStyle = "#64748b"; context.font = "13px Arial"; context.fillText(`Generated ${dataset.generatedAt}`, MARGIN, height - 24);
  context.textAlign = "right"; context.fillText(`Page ${page} of ${pages}`, WIDTH - MARGIN, height - 24);
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode PNG.")), "image/png"));
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  try { anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}

export async function exportBillingPrincipalVisualReport(kind: BillingPrincipalVisualExportKind, input: VisualExportInput) {
  abortIfRequested(input.signal);
  const pages = buildBillingPrincipalVisualPages(input.dataset);
  const base = `billing-principal-${input.dataset.overview.asOf}`;
  if (kind === "png") {
    for (let index = 0; index < pages.length; index += 1) {
      await yieldBillingPrincipalExport(input.signal);
      const canvas = renderPage(input.dataset, pages[index]!, index + 1, pages.length);
      try {
        const blob = await canvasBlob(canvas);
        abortIfRequested(input.signal);
        await input.beforeDownload();
        abortIfRequested(input.signal);
        download(blob, `${base}-part-${String(index + 1).padStart(3, "0")}.png`);
      } finally { canvas.width = 1; canvas.height = 1; }
    }
    return;
  }
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    await yieldBillingPrincipalExport(input.signal);
    if (index) pdf.addPage("a4", "landscape");
    const canvas = renderPage(input.dataset, pages[index]!, index + 1, pages.length);
    try {
      const availableWidth = pdf.internal.pageSize.getWidth() - 6;
      const availableHeight = pdf.internal.pageSize.getHeight() - 6;
      const fit = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
      const imageWidth = canvas.width * fit;
      const imageHeight = canvas.height * fit;
      pdf.addImage(canvas, "PNG", 3, 3, imageWidth, imageHeight, undefined, "FAST");
    } finally { canvas.width = 1; canvas.height = 1; }
  }
  abortIfRequested(input.signal);
  const blob = pdf.output("blob");
  abortIfRequested(input.signal);
  await input.beforeDownload();
  abortIfRequested(input.signal);
  download(blob, `${base}.pdf`);
}
