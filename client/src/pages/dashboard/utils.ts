import { Activity, AlertTriangle, Database, FileText, LogIn, ShieldOff, Users } from "lucide-react";
import {
  formatDateDDMMYYYY,
  formatDateTimeDDMMYYYY,
  formatOperationalDateTime,
} from "@/lib/date-format";
import { createRetryableModuleLoader } from "@/lib/retryable-module-loader";
import type { SummaryCardItem, SummaryData } from "@/pages/dashboard/types";
import type { LoginTrend } from "@/pages/dashboard/types";

const loadHtml2Canvas = createRetryableModuleLoader<typeof import("html2canvas")["default"]>(
  async () => (await import("html2canvas")).default,
);
const loadJsPdf = createRetryableModuleLoader<typeof import("jspdf")["default"]>(
  async () => (await import("jspdf")).default,
);

export const ROLE_COLORS: Record<string, string> = {
  superuser: "hsl(var(--chart-1))",
  admin: "hsl(var(--chart-2))",
  user: "hsl(var(--chart-3))",
};

type DashboardExportThemePalette = {
  background: string;
  border: string;
  foreground: string;
  mutedForeground: string;
};

type DashboardExportColorProbeKey = keyof DashboardExportThemePalette;
type DashboardExportColorProbeDefinition = Record<
  DashboardExportColorProbeKey,
  {
    cssValue: string;
    fallback: string;
  }
>;

const DASHBOARD_EXPORT_FALLBACK_PALETTE: DashboardExportThemePalette = {
  background: "rgb(255, 255, 255)",
  border: "rgb(226, 232, 240)",
  foreground: "rgb(30, 41, 59)",
  mutedForeground: "rgb(100, 116, 139)",
};

function resolveDashboardExportCssColors(
  targetDocument: Document | undefined,
  definitions: DashboardExportColorProbeDefinition,
): DashboardExportThemePalette {
  const view = targetDocument?.defaultView;
  if (!targetDocument || !view) {
    return {
      background: definitions.background.fallback,
      border: definitions.border.fallback,
      foreground: definitions.foreground.fallback,
      mutedForeground: definitions.mutedForeground.fallback,
    };
  }

  const probeParent = targetDocument.body ?? targetDocument.documentElement;
  if (!probeParent) {
    return {
      background: definitions.background.fallback,
      border: definitions.border.fallback,
      foreground: definitions.foreground.fallback,
      mutedForeground: definitions.mutedForeground.fallback,
    };
  }

  const probeContainer = targetDocument.createElement("div");
  probeContainer.style.position = "absolute";
  probeContainer.style.width = "0";
  probeContainer.style.height = "0";
  probeContainer.style.opacity = "0";
  probeContainer.style.pointerEvents = "none";
  probeContainer.style.overflow = "hidden";
  probeContainer.setAttribute("aria-hidden", "true");

  const probeEntries = Object.entries(definitions).map(([key, definition]) => {
    const probe = targetDocument.createElement("span");
    probe.style.color = definition.fallback;
    probe.style.color = definition.cssValue;
    probe.dataset.dashboardProbeKey = key;
    probeContainer.appendChild(probe);
    return [key as DashboardExportColorProbeKey, probe] as const;
  });
  probeParent.appendChild(probeContainer);

  try {
    return probeEntries.reduce<DashboardExportThemePalette>((palette, [key, probe]) => {
      const resolvedColor = view.getComputedStyle(probe).color;
      palette[key] = resolvedColor || definitions[key].fallback;
      return palette;
    }, {
      background: definitions.background.fallback,
      border: definitions.border.fallback,
      foreground: definitions.foreground.fallback,
      mutedForeground: definitions.mutedForeground.fallback,
    });
  } finally {
    probeContainer.remove();
  }
}

export function resolveDashboardExportThemePalette(
  targetDocument?: Document,
): DashboardExportThemePalette {
  return resolveDashboardExportCssColors(targetDocument, {
    background: {
      cssValue: "hsl(var(--background))",
      fallback: DASHBOARD_EXPORT_FALLBACK_PALETTE.background,
    },
    border: {
      cssValue: "hsl(var(--border))",
      fallback: DASHBOARD_EXPORT_FALLBACK_PALETTE.border,
    },
    foreground: {
      cssValue: "hsl(var(--foreground))",
      fallback: DASHBOARD_EXPORT_FALLBACK_PALETTE.foreground,
    },
    mutedForeground: {
      cssValue: "hsl(var(--muted-foreground))",
      fallback: DASHBOARD_EXPORT_FALLBACK_PALETTE.mutedForeground,
    },
  });
}

function parseDashboardExportRgbChannels(
  value: string,
  fallback: readonly [number, number, number],
): [number, number, number] {
  const normalized = String(value || "").trim();
  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);

  if (rgbMatch) {
    const channels = rgbMatch[1]
      .split(",")
      .slice(0, 3)
      .map((channel) => Number.parseFloat(channel.trim()));

    if (channels.length === 3 && channels.every((channel) => Number.isFinite(channel))) {
      return [channels[0]!, channels[1]!, channels[2]!];
    }
  }

  const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split("").map((character) => character + character).join("")
      : hexMatch[1];

    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }

  return [fallback[0], fallback[1], fallback[2]];
}

function formatDashboardExportRgbColor(
  channels: readonly [number, number, number],
): string {
  const [red, green, blue] = channels.map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel))),
  ) as [number, number, number];

  return `rgb(${red}, ${green}, ${blue})`;
}

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
      color: "text-blue-600 dark:text-blue-400",
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

export async function exportDashboardToPdf(element: HTMLDivElement) {
  const [html2canvas, jsPDF] = await Promise.all([
    loadHtml2Canvas(),
    loadJsPdf(),
  ]);
  const exportTheme = resolveDashboardExportThemePalette(element.ownerDocument);
  const backgroundColor = exportTheme.background;
  const backgroundRgb = parseDashboardExportRgbChannels(backgroundColor, [255, 255, 255]);
  const foregroundRgb = parseDashboardExportRgbChannels(exportTheme.foreground, [30, 41, 59]);
  const mutedForegroundRgb = parseDashboardExportRgbChannels(exportTheme.mutedForeground, [100, 116, 139]);
  const borderRgb = parseDashboardExportRgbChannels(exportTheme.border, [226, 232, 240]);
  const safeBackgroundColor = formatDashboardExportRgbColor(backgroundRgb);
  const safeForegroundColor = formatDashboardExportRgbColor(foregroundRgb);
  const safeBorderColor = formatDashboardExportRgbColor(borderRgb);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: safeBackgroundColor,
    width: element.scrollWidth,
    height: element.scrollHeight,
    scrollX: 0,
    scrollY: -window.scrollY,
    ignoreElements: (node) => node.tagName === "IFRAME",
    onclone: (clonedDoc) => {
      const style = clonedDoc.createElement("style");
      style.textContent = `
        :root {
          color-scheme: ${element.ownerDocument.documentElement.classList.contains("dark") ? "dark" : "light"};
        }
        * {
          color: ${safeForegroundColor} !important;
          background-color: ${safeBackgroundColor} !important;
          border-color: ${safeBorderColor} !important;
        }
        .recharts-text { fill: ${safeForegroundColor} !important; }
      `;
      clonedDoc.head.appendChild(style);
    },
  });

  try {
    const imageData = canvas.toDataURL("image/png", 1.0);
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    pdf.setFillColor(...backgroundRgb);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");

    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...foregroundRgb);
    pdf.text("SQR Dashboard Analytics Report", 14, 18);

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...mutedForegroundRgb);
    pdf.text(`Generated: ${formatDateTimeDDMMYYYY(new Date(), { includeSeconds: true })}`, 14, 26);

    pdf.setDrawColor(...borderRgb);
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
    pdf.setTextColor(...mutedForegroundRgb);
    pdf.text("Sumbangan Query Rahmah (SQR) System", margin, pageHeight - 5);
    pdf.text("Page 1 of 1", pageWidth - margin - 20, pageHeight - 5);
    pdf.save(`SQR-Dashboard-Report-${new Date().toISOString().split("T")[0]}.pdf`);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
