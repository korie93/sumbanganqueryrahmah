import { Activity, AlertTriangle, Database, FileText, LogIn, ShieldOff, Users } from "lucide-react";
import {
  formatDateDDMMYYYY,
  formatDateTimeDDMMYYYY,
  formatOperationalDateTime,
} from "@/lib/date-format";
import { getSqrTrustedTypesPolicy } from "@/lib/trusted-types";
import type { SummaryCardItem, SummaryData } from "@/pages/dashboard/types";
import type { LoginTrend } from "@/pages/dashboard/types";

let html2canvasLoader: Promise<typeof import("html2canvas")["default"]> | null = null;
let jsPdfLoader: Promise<typeof import("jspdf")["default"]> | null = null;
const DASHBOARD_EXPORT_ROOT_ATTRIBUTE = "data-dashboard-export-root";
const DASHBOARD_EXPORT_EXCLUDED_SELECTOR = "[hidden], [aria-hidden='true'], [data-export-sensitive='true']";
const DASHBOARD_EXPORT_DEFAULT_SCALE = 2;
const DASHBOARD_EXPORT_MAX_CANVAS_DIMENSION = 8192;
const DASHBOARD_EXPORT_MAX_CANVAS_PIXELS = 12_000_000;
const DASHBOARD_EXPORT_SVG_COLOR_ATTRIBUTES = ["fill", "stroke", "stop-color"] as const;
export const DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE = "Gagal jana PDF. Sila cuba semula.";

type DashboardHtml2Canvas = typeof import("html2canvas")["default"];
type DashboardHtml2CanvasOptions = NonNullable<Parameters<DashboardHtml2Canvas>[1]>;
type DashboardDocumentWrite = typeof Document.prototype.write;
type DashboardDocumentConstructor = {
  prototype: {
    write: DashboardDocumentWrite;
  };
};

export const ROLE_COLORS: Record<string, string> = {
  superuser: "hsl(var(--chart-1))",
  admin: "hsl(var(--chart-2))",
  user: "hsl(var(--chart-3))",
};

export function formatDashboardHour(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function formatDashboardDate(dateStr: string) {
  return formatDateDDMMYYYY(dateStr, dateStr);
}

export function formatDashboardAxisDate(dateStr: string) {
  const formatted = formatDashboardDate(dateStr);
  const [day, month] = formatted.split("/");
  return day && month ? `${day}/${month}` : formatted;
}

export function buildDashboardTrendTickDates(
  trends: readonly LoginTrend[] | undefined,
  maxTickCount: number,
) {
  if (!trends?.length || maxTickCount <= 0) {
    return [];
  }

  if (trends.length <= maxTickCount) {
    return trends.map((trend) => trend.date);
  }

  if (maxTickCount === 1) {
    return [trends[trends.length - 1]!.date];
  }

  const lastIndex = trends.length - 1;
  const tickIndexes = new Set<number>([0, lastIndex]);

  for (let segment = 1; segment < maxTickCount - 1; segment += 1) {
    const index = Math.round((segment * lastIndex) / (maxTickCount - 1));
    tickIndexes.add(index);
  }

  return Array.from(tickIndexes)
    .sort((left, right) => left - right)
    .map((index) => trends[index]!.date);
}

export function formatDashboardUserLastLogin(value: string | null | undefined) {
  if (!value) return "Unknown";
  return formatOperationalDateTime(value, { fallback: "Unknown" });
}

export function buildSummaryCards(summary: SummaryData | undefined): SummaryCardItem[] {
  return [
    {
      title: "Total Users",
      value: summary?.totalUsers || 0,
      icon: Users,
      color: "text-blue-600 dark:text-primary",
    },
    {
      title: "Active Sessions",
      value: summary?.activeSessions || 0,
      icon: Activity,
      color: "text-green-600 dark:text-green-400",
    },
    {
      title: "Logins Today",
      value: summary?.loginsToday || 0,
      icon: LogIn,
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      title: "Total Data Rows",
      value: summary?.totalDataRows || 0,
      icon: Database,
      color: "text-orange-600 dark:text-orange-400",
    },
    {
      title: "Total Imports",
      value: summary?.totalImports || 0,
      icon: FileText,
      color: "text-teal-600 dark:text-teal-400",
    },
    {
      title: "Banned Users",
      value: summary?.bannedUsers || 0,
      icon: ShieldOff,
      color: "text-red-600 dark:text-red-400",
    },
    {
      title: "Stale Record Conflicts (24h)",
      value: summary?.collectionRecordVersionConflicts24h || 0,
      icon: AlertTriangle,
      color: "text-amber-600 dark:text-amber-400",
    },
  ];
}

function loadHtml2Canvas() {
  if (!html2canvasLoader) {
    html2canvasLoader = import("html2canvas")
      .then((module) => module.default)
      .catch((error: unknown) => {
        html2canvasLoader = null;
        throw error;
      });
  }
  return html2canvasLoader;
}

function loadJsPdf() {
  if (!jsPdfLoader) {
    jsPdfLoader = import("jspdf")
      .then((module) => module.default)
      .catch((error: unknown) => {
        jsPdfLoader = null;
        throw error;
      });
  }
  return jsPdfLoader;
}

export function assertDashboardExportableElement(element: HTMLElement) {
  if (element.getAttribute(DASHBOARD_EXPORT_ROOT_ATTRIBUTE) !== "true") {
    throw new Error("Dashboard export is limited to the approved dashboard report region.");
  }

  if (element.closest(DASHBOARD_EXPORT_EXCLUDED_SELECTOR)) {
    throw new Error("Dashboard export region must not be hidden or marked sensitive.");
  }
}

function shouldIgnoreDashboardExportElement(node: Element) {
  return node.tagName === "IFRAME" || node.matches(DASHBOARD_EXPORT_EXCLUDED_SELECTOR);
}

const DASHBOARD_EXPORT_LIGHT_PALETTE: Record<string, string> = {
  "--background": "#ffffff",
  "--border": "#e2e8f0",
  "--card": "#ffffff",
  "--chart-1": "#2563eb",
  "--chart-2": "#16a34a",
  "--chart-3": "#f97316",
  "--chart-4": "#7c3aed",
  "--chart-5": "#0891b2",
  "--destructive": "#dc2626",
  "--foreground": "#1e293b",
  "--muted": "#f1f5f9",
  "--muted-foreground": "#64748b",
  "--primary": "#2563eb",
  "--primary-foreground": "#ffffff",
};

const DASHBOARD_EXPORT_DARK_PALETTE: Record<string, string> = {
  "--background": "#1e293b",
  "--border": "#475569",
  "--card": "#1e293b",
  "--chart-1": "#60a5fa",
  "--chart-2": "#4ade80",
  "--chart-3": "#fb923c",
  "--chart-4": "#a78bfa",
  "--chart-5": "#22d3ee",
  "--destructive": "#f87171",
  "--foreground": "#e2e8f0",
  "--muted": "#334155",
  "--muted-foreground": "#94a3b8",
  "--primary": "#60a5fa",
  "--primary-foreground": "#0f172a",
};

function getDashboardExportPalette(isDark: boolean) {
  return isDark ? DASHBOARD_EXPORT_DARK_PALETTE : DASHBOARD_EXPORT_LIGHT_PALETTE;
}

export function resolveDashboardExportScale(width: number, height: number) {
  const safeWidth = Math.max(1, Math.ceil(width));
  const safeHeight = Math.max(1, Math.ceil(height));
  const pixelScale = Math.sqrt(DASHBOARD_EXPORT_MAX_CANVAS_PIXELS / (safeWidth * safeHeight));
  const dimensionScale = DASHBOARD_EXPORT_MAX_CANVAS_DIMENSION / Math.max(safeWidth, safeHeight);
  const scale = Math.min(DASHBOARD_EXPORT_DEFAULT_SCALE, pixelScale, dimensionScale);

  return Number(Math.max(0.1, scale).toFixed(2));
}

export function resolveDashboardExportPaintColor(
  value: string | null | undefined,
  isDark: boolean,
) {
  const normalized = value?.trim();
  if (!normalized || normalized === "none" || normalized.startsWith("url(") || !normalized.includes("var(")) {
    return null;
  }

  const variableName = /--[\w-]+/.exec(normalized)?.[0];
  if (!variableName) {
    return null;
  }

  const palette = getDashboardExportPalette(isDark);
  return palette[variableName] ?? palette["--foreground"];
}

function resolveDashboardInlineStyleColors(styleValue: string, isDark: boolean) {
  const palette = getDashboardExportPalette(isDark);
  return styleValue.replace(
    /hsl\(var\((--[\w-]+)\)(?:\s*\/\s*[\d.]+)?\)/g,
    (_match, variableName: string) => palette[variableName] ?? palette["--foreground"],
  );
}

export function sanitizeDashboardExportClone(root: ParentNode, isDark: boolean) {
  root
    .querySelectorAll("svg [fill], svg [stroke], svg [stop-color]")
    .forEach((node) => {
      for (const attribute of DASHBOARD_EXPORT_SVG_COLOR_ATTRIBUTES) {
        const resolvedColor = resolveDashboardExportPaintColor(
          node.getAttribute(attribute),
          isDark,
        );
        if (resolvedColor) {
          node.setAttribute(attribute, resolvedColor);
        }
      }
    });

  root.querySelectorAll<HTMLElement>("[style*='hsl(var']").forEach((node) => {
    const currentStyle = node.getAttribute("style");
    if (!currentStyle) return;
    node.setAttribute("style", resolveDashboardInlineStyleColors(currentStyle, isDark));
  });
}

function createDashboardTrustedHtml(input: string) {
  const policy = getSqrTrustedTypesPolicy();
  return policy ? policy.createHTML(input) : input;
}

function getDashboardDocumentConstructor() {
  return (globalThis as typeof globalThis & {
    Document?: DashboardDocumentConstructor;
  }).Document;
}

export async function withDashboardTrustedHtmlDocumentWrite<T>(operation: () => Promise<T>) {
  const documentConstructor = getDashboardDocumentConstructor();
  const documentPrototype = documentConstructor?.prototype;
  if (!documentPrototype || typeof documentPrototype.write !== "function") {
    return operation();
  }

  const originalWrite = documentPrototype.write;
  documentPrototype.write = function writeTrustedDashboardHtml(
    this: Document,
    ...text: string[]
  ) {
    const trustedText = text.map((part) =>
      createDashboardTrustedHtml(String(part)),
    ) as unknown as string[];
    return originalWrite.apply(this, trustedText);
  };

  try {
    return await operation();
  } finally {
    documentPrototype.write = originalWrite;
  }
}

export async function captureDashboardElementCanvas(
  element: HTMLElement,
  html2canvas: DashboardHtml2Canvas,
  options: DashboardHtml2CanvasOptions,
) {
  try {
    return await withDashboardTrustedHtmlDocumentWrite(() => html2canvas(element, options));
  } catch (error) {
    const exportError = new Error(DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE) as Error & {
      cause?: unknown;
    };
    exportError.cause = error;
    throw exportError;
  }
}

export async function exportDashboardToPdf(element: HTMLDivElement) {
  assertDashboardExportableElement(element);

  const [html2canvas, jsPDF] = await Promise.all([
    loadHtml2Canvas(),
    loadJsPdf(),
  ]);

  const isDark = document.documentElement.classList.contains("dark");
  const backgroundColor = isDark ? "#1e293b" : "#ffffff";

  const canvas = await captureDashboardElementCanvas(element, html2canvas, {
    scale: resolveDashboardExportScale(element.scrollWidth, element.scrollHeight),
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor,
    width: element.scrollWidth,
    height: element.scrollHeight,
    windowWidth: Math.max(document.documentElement.clientWidth, element.scrollWidth),
    windowHeight: Math.max(document.documentElement.clientHeight, element.scrollHeight),
    scrollX: 0,
    scrollY: -window.scrollY,
    ignoreElements: shouldIgnoreDashboardExportElement,
    onclone: (clonedDoc) => {
      const style = clonedDoc.createElement("style");
      style.textContent = `
        * {
          color: ${isDark ? "#e2e8f0" : "#1e293b"} !important;
          background-color: ${isDark ? "#1e293b" : "#ffffff"} !important;
          border-color: ${isDark ? "#475569" : "#e2e8f0"} !important;
        }
        .recharts-text { fill: ${isDark ? "#e2e8f0" : "#1e293b"} !important; }
      `;
      clonedDoc.head.appendChild(style);
      sanitizeDashboardExportClone(clonedDoc, isDark);
    },
  });

  try {
    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error(DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE);
    }

    const imageData = canvas.toDataURL("image/png", 1.0);
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");

    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(isDark ? 255 : 30);
    pdf.text("SQR Dashboard Analytics Report", 14, 18);

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(isDark ? 180 : 100);
    pdf.text(`Generated: ${formatDateTimeDDMMYYYY(new Date(), { includeSeconds: true })}`, 14, 26);

    pdf.setDrawColor(isDark ? 100 : 200);
    pdf.setLineWidth(0.5);
    pdf.line(14, 30, pageWidth - 14, 30);

    const margin = 14;
    const headerHeight = 35;
    const availableWidth = pageWidth - margin * 2;
    const availableHeight = pageHeight - headerHeight - margin;
    const ratio = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
    const finalWidth = canvas.width * ratio;
    const finalHeight = canvas.height * ratio;
    const imageX = margin + (availableWidth - finalWidth) / 2;
    const imageY = headerHeight;

    pdf.addImage(imageData, "PNG", imageX, imageY, finalWidth, finalHeight);
    pdf.setFontSize(8);
    pdf.setTextColor(isDark ? 120 : 150);
    pdf.text("Sumbangan Query Rahmah (SQR) System", margin, pageHeight - 5);
    pdf.text("Page 1 of 1", pageWidth - margin - 20, pageHeight - 5);
    pdf.save(`SQR-Dashboard-Report-${new Date().toISOString().split("T")[0]}.pdf`);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
