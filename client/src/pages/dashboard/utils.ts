import { Activity, AlertTriangle, Database, FileText, LogIn, ShieldOff, Users } from "lucide-react";
import {
  formatDateDDMMYYYY,
  formatDateTimeDDMMYYYY,
  formatOperationalDateTime,
} from "@/lib/date-format";
import { getSqrTrustedTypesPolicy } from "@/lib/trusted-types";
import {
  initializeTrustedTypesRuntimeForGlobal,
  type TrustedTypesRuntimeGlobal,
} from "@/lib/trusted-types-runtime";
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
const DASHBOARD_FALLBACK_PDF_MAX_LINES = 90;
const DASHBOARD_FALLBACK_PDF_MAX_LINE_LENGTH = 130;
const DASHBOARD_DOM_ELEMENT_NODE_TYPE = 1;
const DASHBOARD_DOM_TEXT_NODE_TYPE = 3;
export const DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE = "Gagal jana PDF. Sila cuba semula.";

type DashboardHtml2Canvas = typeof import("html2canvas")["default"];
type DashboardHtml2CanvasOptions = NonNullable<Parameters<DashboardHtml2Canvas>[1]>;
type DashboardJsPdfDocument = InstanceType<typeof import("jspdf")["default"]>;
type DashboardDocumentWrite = typeof Document.prototype.write;
type DashboardDocumentConstructor = {
  prototype: {
    write: DashboardDocumentWrite;
  };
};
type DashboardIframeConstructor = {
  prototype: HTMLIFrameElement;
};
type DashboardTrustedTypesTarget = TrustedTypesRuntimeGlobal & {
  Document?: DashboardDocumentConstructor;
  HTMLIFrameElement?: DashboardIframeConstructor;
};
type DashboardCleanup = () => void;
type DashboardPdfTheme = "dark" | "light";

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

function getDashboardTrustedTypesTarget(target: unknown) {
  if (!target || typeof target !== "object") {
    return null;
  }

  return target as DashboardTrustedTypesTarget;
}

function initializeDashboardTrustedTypesTarget(target: unknown) {
  const trustedTypesTarget = getDashboardTrustedTypesTarget(target);
  if (!trustedTypesTarget) {
    return undefined;
  }

  return initializeTrustedTypesRuntimeForGlobal(trustedTypesTarget);
}

function createDashboardTrustedHtmlForTarget(input: string, target: unknown) {
  const policy = initializeDashboardTrustedTypesTarget(target);
  if (policy) {
    return policy.createHTML(input);
  }

  return target === globalThis ? createDashboardTrustedHtml(input) : input;
}

function patchDashboardDocumentWriteForTarget(
  target: unknown,
  patchedDocumentPrototypes: WeakSet<object>,
  cleanups: DashboardCleanup[],
) {
  const trustedTypesTarget = getDashboardTrustedTypesTarget(target);
  const documentPrototype = trustedTypesTarget?.Document?.prototype;
  if (
    !documentPrototype
    || typeof documentPrototype.write !== "function"
    || patchedDocumentPrototypes.has(documentPrototype)
  ) {
    return;
  }

  initializeDashboardTrustedTypesTarget(trustedTypesTarget);
  patchedDocumentPrototypes.add(documentPrototype);

  const originalWrite = documentPrototype.write;
  documentPrototype.write = function writeTrustedDashboardHtml(
    this: Document,
    ...text: string[]
  ) {
    const trustedText = text.map((part) =>
      createDashboardTrustedHtmlForTarget(String(part), trustedTypesTarget),
    ) as unknown as string[];
    return originalWrite.apply(this, trustedText);
  };

  cleanups.push(() => {
    documentPrototype.write = originalWrite;
    patchedDocumentPrototypes.delete(documentPrototype);
  });
}

function getDashboardIframeConstructor() {
  return (globalThis as typeof globalThis & {
    HTMLIFrameElement?: DashboardIframeConstructor;
  }).HTMLIFrameElement;
}

export async function withDashboardTrustedHtmlDocumentWrite<T>(operation: () => Promise<T>) {
  const cleanups: DashboardCleanup[] = [];
  const patchedDocumentPrototypes = new WeakSet<object>();

  patchDashboardDocumentWriteForTarget(globalThis, patchedDocumentPrototypes, cleanups);

  const iframeConstructor = getDashboardIframeConstructor();
  const iframePrototype = iframeConstructor?.prototype;
  const contentWindowDescriptor = iframePrototype
    ? Object.getOwnPropertyDescriptor(iframePrototype, "contentWindow")
    : undefined;

  if (iframePrototype && contentWindowDescriptor?.get && contentWindowDescriptor.configurable) {
    Object.defineProperty(iframePrototype, "contentWindow", {
      ...contentWindowDescriptor,
      get(this: HTMLIFrameElement) {
        const frameWindow = contentWindowDescriptor.get?.call(this) ?? null;
        if (frameWindow) {
          initializeDashboardTrustedTypesTarget(frameWindow);
          patchDashboardDocumentWriteForTarget(
            frameWindow,
            patchedDocumentPrototypes,
            cleanups,
          );
        }
        return frameWindow;
      },
    });

    cleanups.push(() => {
      Object.defineProperty(iframePrototype, "contentWindow", contentWindowDescriptor);
    });
  }

  try {
    return await operation();
  } finally {
    for (const cleanup of cleanups.reverse()) {
      cleanup();
    }
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

function getDashboardPdfTheme(isDark: boolean): DashboardPdfTheme {
  return isDark ? "dark" : "light";
}

function normalizeDashboardFallbackPdfLine(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return null;
  }

  return normalized.length > DASHBOARD_FALLBACK_PDF_MAX_LINE_LENGTH
    ? `${normalized.slice(0, DASHBOARD_FALLBACK_PDF_MAX_LINE_LENGTH - 3)}...`
    : normalized;
}

function isDashboardFallbackPdfElementExcluded(element: Element) {
  const tagName = element.tagName.toUpperCase();
  return (
    tagName === "SCRIPT"
    || tagName === "STYLE"
    || tagName === "NOSCRIPT"
    || shouldIgnoreDashboardExportElement(element)
    || Boolean(element.closest(DASHBOARD_EXPORT_EXCLUDED_SELECTOR))
  );
}

export function collectDashboardFallbackPdfLines(
  root: Element,
  maxLines = DASHBOARD_FALLBACK_PDF_MAX_LINES,
) {
  const lines: string[] = [];
  let previousLine: string | null = null;

  const appendLine = (value: string | null | undefined) => {
    if (lines.length >= maxLines) {
      return;
    }

    const normalized = normalizeDashboardFallbackPdfLine(value);
    if (!normalized || normalized === previousLine) {
      return;
    }

    lines.push(normalized);
    previousLine = normalized;
  };

  const visit = (node: Node) => {
    if (lines.length >= maxLines) {
      return;
    }

    if (node.nodeType === DASHBOARD_DOM_TEXT_NODE_TYPE) {
      appendLine(node.textContent);
      return;
    }

    if (node.nodeType !== DASHBOARD_DOM_ELEMENT_NODE_TYPE) {
      return;
    }

    const element = node as Element;
    if (element !== root && isDashboardFallbackPdfElementExcluded(element)) {
      return;
    }

    for (const child of Array.from(element.childNodes)) {
      visit(child);
      if (lines.length >= maxLines) {
        break;
      }
    }
  };

  visit(root);
  return lines;
}

function setDashboardPdfPageTheme(pdf: DashboardJsPdfDocument, theme: DashboardPdfTheme) {
  const isDark = theme === "dark";
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  return { pageWidth, pageHeight };
}

function writeDashboardPdfHeader(pdf: DashboardJsPdfDocument, theme: DashboardPdfTheme) {
  const isDark = theme === "dark";
  const { pageWidth } = setDashboardPdfPageTheme(pdf, theme);

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
}

function writeDashboardPdfFooter(
  pdf: DashboardJsPdfDocument,
  theme: DashboardPdfTheme,
  pageNumber: number,
  pageCount: number,
) {
  const isDark = theme === "dark";
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  pdf.setFontSize(8);
  pdf.setTextColor(isDark ? 120 : 150);
  pdf.text("Sumbangan Query Rahmah (SQR) System", 14, pageHeight - 5);
  pdf.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - 34, pageHeight - 5);
}

function saveDashboardCanvasPdf(
  pdf: DashboardJsPdfDocument,
  canvas: HTMLCanvasElement,
  theme: DashboardPdfTheme,
) {
  const isDark = theme === "dark";
  const imageData = canvas.toDataURL("image/png", 1.0);
  writeDashboardPdfHeader(pdf, theme);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
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
  pdf.setTextColor(isDark ? 120 : 150);
  writeDashboardPdfFooter(pdf, theme, 1, 1);
}

export function writeDashboardFallbackPdf(
  pdf: DashboardJsPdfDocument,
  lines: readonly string[],
  theme: DashboardPdfTheme,
) {
  const safeLines = lines.length > 0 ? lines : ["Dashboard data is currently unavailable."];
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 28;
  const lineHeight = 6;
  const pageContentStartY = 40;
  const pageContentEndY = pageHeight - 14;
  const pages: string[][] = [[]];
  let cursorY = pageContentStartY;

  for (const line of safeLines) {
    const wrapped = pdf.splitTextToSize(line, contentWidth) as string[];
    for (const wrappedLine of wrapped) {
      if (cursorY + lineHeight > pageContentEndY) {
        pages.push([]);
        cursorY = pageContentStartY;
      }
      pages[pages.length - 1]!.push(wrappedLine);
      cursorY += lineHeight;
    }
    cursorY += 2;
  }

  pages.forEach((pageLines, pageIndex) => {
    if (pageIndex > 0) {
      pdf.addPage();
    }

    writeDashboardPdfHeader(pdf, theme);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(theme === "dark" ? 226 : 30);

    let lineY = pageContentStartY;
    for (const line of pageLines) {
      pdf.text(line, 14, lineY);
      lineY += lineHeight;
    }

    writeDashboardPdfFooter(pdf, theme, pageIndex + 1, pages.length);
  });
}

function createDashboardPdf(jsPDF: typeof import("jspdf")["default"]) {
  return new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });
}

function saveDashboardPdf(pdf: DashboardJsPdfDocument) {
  pdf.save(`SQR-Dashboard-Report-${new Date().toISOString().split("T")[0]}.pdf`);
}

export async function exportDashboardToPdf(element: HTMLDivElement) {
  assertDashboardExportableElement(element);

  const [html2canvas, jsPDF] = await Promise.all([
    loadHtml2Canvas(),
    loadJsPdf(),
  ]);

  const isDark = document.documentElement.classList.contains("dark");
  const backgroundColor = isDark ? "#1e293b" : "#ffffff";
  const theme = getDashboardPdfTheme(isDark);

  let canvas: HTMLCanvasElement | null = null;

  try {
    canvas = await captureDashboardElementCanvas(element, html2canvas, {
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

    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error(DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE);
    }

    const pdf = createDashboardPdf(jsPDF);
    saveDashboardCanvasPdf(pdf, canvas, theme);
    saveDashboardPdf(pdf);
  } catch (error) {
    const fallbackPdf = createDashboardPdf(jsPDF);
    const fallbackLines = collectDashboardFallbackPdfLines(element);
    try {
      writeDashboardFallbackPdf(fallbackPdf, fallbackLines, theme);
      saveDashboardPdf(fallbackPdf);
    } catch (fallbackError) {
      const exportError = new Error(DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE) as Error & {
        cause?: unknown;
      };
      exportError.cause = { captureError: error, fallbackError };
      throw exportError;
    }
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
