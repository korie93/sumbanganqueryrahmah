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
import { buildPathForPage } from "@/app/routing";
import type {
  DashboardActionQueueItem,
  DashboardAccessSignal,
  DashboardLoginPatternSummary,
  DashboardLoginHealthScore,
  DashboardLoginRiskExplanation,
  DashboardLoginRiskInsight,
  DashboardLoginRiskSummary,
  DashboardSessionHealthItem,
  LoginTrend,
  PeakHour,
  RecentLoginActivity,
  RecentLoginActivityStatus,
  SummaryCardItem,
  SummaryData,
  TopUser,
} from "@/pages/dashboard/types";

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
const DASHBOARD_PDF_MARGIN_MM = 14;
const DASHBOARD_PDF_HEADER_HEIGHT_MM = 39;
const DASHBOARD_PDF_FOOTER_HEIGHT_MM = 12;
const DASHBOARD_PDF_ROW_GAP_MM = 3;
const DASHBOARD_PDF_FALLBACK_ROW_MIN_HEIGHT_MM = 10;
export const DASHBOARD_PDF_EXPORT_FAILURE_MESSAGE = "Gagal jana PDF. Sila cuba semula.";
export type DashboardRecentLoginActivityFilter = "all" | "active" | "ended" | "attention";
export type DashboardRecentLoginRiskTone = "success" | "warning" | "info";
const DASHBOARD_ACTION_QUEUE_MAX_ITEMS = 4;
const DASHBOARD_SESSION_FRESH_MAX_AGE_MS = 15 * 60 * 1000;
const DASHBOARD_SESSION_IDLE_WATCH_MAX_AGE_MS = 60 * 60 * 1000;
const DASHBOARD_LOGIN_HEALTH_DEDUCTION_BY_TONE = {
  danger: 32,
  info: 0,
  success: 0,
  warning: 12,
} as const;

export interface DashboardRecentLoginRiskNote {
  label: string;
  description: string;
  tone: DashboardRecentLoginRiskTone;
}

const DASHBOARD_RECENT_LOGIN_ATTENTION_REASON_PATTERN =
  /banned|blocked|expired|forced|idle|kicked|locked|revoked|timeout/i;

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
type DashboardPdfRgb = readonly [number, number, number];
type DashboardCanvasPdfSlice = {
  readonly sourceY: number;
  readonly sourceHeight: number;
  readonly imageX: number;
  readonly imageY: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
};
export interface DashboardPdfSummaryInput {
  readonly peakHours?: readonly PeakHour[] | undefined;
  readonly recentLoginActivities?: readonly RecentLoginActivity[] | undefined;
  readonly summary?: SummaryData | undefined;
  readonly topUsers?: readonly TopUser[] | undefined;
  readonly trends?: readonly LoginTrend[] | undefined;
}

export interface DashboardPdfSummarySection {
  readonly title: string;
  readonly rows: readonly string[];
}

export interface DashboardPdfSummaryReport {
  readonly generatedAtLabel: string;
  readonly sections: readonly DashboardPdfSummarySection[];
  readonly statusLabel: string;
  readonly subtitle: string;
  readonly title: string;
}

type DashboardFallbackPdfContent = readonly string[] | DashboardPdfSummaryReport;
type DashboardFallbackPdfRowKind = "section" | "body";
type DashboardFallbackPdfRow = {
  readonly kind: DashboardFallbackPdfRowKind;
  readonly text: string;
};
type DashboardFallbackPdfLayoutRow = DashboardFallbackPdfRow & {
  readonly lines: readonly string[];
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

export function formatDashboardRecentLoginTime(value: string | null | undefined) {
  if (!value) return "Unknown";
  return formatOperationalDateTime(value, { fallback: "Unknown" });
}

export function resolveDashboardRecentLoginStatusMeta(status: RecentLoginActivityStatus) {
  if (status === "active") {
    return {
      label: "Active",
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }

  return {
    label: "Ended",
    className: "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  };
}

export function isDashboardRecentLoginAttentionActivity(activity: RecentLoginActivity) {
  const logoutReason = activity.logoutReason?.trim();
  if (!logoutReason) {
    return false;
  }

  return DASHBOARD_RECENT_LOGIN_ATTENTION_REASON_PATTERN.test(logoutReason);
}

export function filterDashboardRecentLoginActivities(
  activities: readonly RecentLoginActivity[],
  filter: DashboardRecentLoginActivityFilter,
) {
  if (filter === "all") {
    return [...activities];
  }

  if (filter === "attention") {
    return activities.filter(isDashboardRecentLoginAttentionActivity);
  }

  return activities.filter((activity) => activity.status === filter);
}

export function buildDashboardRecentLoginActivityFilterCounts(
  activities: readonly RecentLoginActivity[],
): Record<DashboardRecentLoginActivityFilter, number> {
  return {
    active: activities.filter((activity) => activity.status === "active").length,
    all: activities.length,
    attention: activities.filter(isDashboardRecentLoginAttentionActivity).length,
    ended: activities.filter((activity) => activity.status === "ended").length,
  };
}

export function resolveDashboardRecentLoginRiskNote(activity: RecentLoginActivity): DashboardRecentLoginRiskNote {
  const logoutReason = activity.logoutReason?.trim() ?? "";
  const normalizedReason = logoutReason.toLowerCase();

  if (activity.status === "active") {
    return {
      label: "Active session",
      description: "Sesi ini masih aktif dalam rekod terbaru. Semak jika peranti atau lokasi kelihatan tidak biasa.",
      tone: "info",
    };
  }

  if (/banned|blocked|locked/.test(normalizedReason)) {
    return {
      label: "Restricted account event",
      description: "Sesi tamat berkaitan sekatan akaun. Kekalkan rekod ini dalam semakan keselamatan.",
      tone: "warning",
    };
  }

  if (/forced|kicked|revoked/.test(normalizedReason)) {
    return {
      label: "Forced session end",
      description: "Sesi ditamatkan secara paksa. Semak sama ada tindakan ini dijangka oleh operator.",
      tone: "warning",
    };
  }

  if (/expired|idle|timeout/.test(normalizedReason)) {
    return {
      label: "Timeout session",
      description: "Sesi tamat kerana tempoh tidak aktif atau tamat masa. Ini biasanya normal tetapi wajar dipantau jika berulang.",
      tone: "info",
    };
  }

  return {
    label: "Normal session end",
    description: logoutReason
      ? "Sesi tamat dengan nota logout biasa. Tiada signal risiko tambahan dikesan daripada reason ini."
      : "Sesi sudah tamat tanpa nota risiko tambahan.",
    tone: "success",
  };
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
      title: "Failed Logins (24h)",
      value: summary?.loginFailures24h || 0,
      icon: AlertTriangle,
      color: "text-rose-600 dark:text-rose-400",
    },
    {
      title: "Banned Users",
      value: summary?.bannedUsers || 0,
      icon: ShieldOff,
      color: "text-red-600 dark:text-red-400",
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
      title: "Backup Actions (24h)",
      value: summary?.backupActions24h || 0,
      icon: FileText,
      color: "text-cyan-700 dark:text-cyan-300",
    },
    {
      title: "Stale Record Conflicts (24h)",
      value: summary?.collectionRecordVersionConflicts24h || 0,
      icon: AlertTriangle,
      color: "text-amber-600 dark:text-amber-400",
    },
  ];
}

export function buildDashboardAccessSignals(summary: SummaryData | undefined): DashboardAccessSignal[] {
  const activeSessions = summary?.activeSessions ?? 0;
  const loginsToday = summary?.loginsToday ?? 0;
  const loginFailures24h = summary?.loginFailures24h ?? 0;
  const bannedUsers = summary?.bannedUsers ?? 0;

  return [
    {
      title: "Sesi aktif",
      value: activeSessions.toLocaleString(),
      description: "Sesi pengguna yang sedang hidup dan perlu dipantau.",
      tone: "info",
    },
    {
      title: "Login hari ini",
      value: loginsToday.toLocaleString(),
      description: loginsToday > 0
        ? "Aktiviti akses harian sedang direkod."
        : "Belum ada login berjaya direkod hari ini.",
      tone: loginsToday > 0 ? "success" : "info",
    },
    {
      title: "Gagal login 24j",
      value: loginFailures24h.toLocaleString(),
      description: loginFailures24h > 0
        ? "Semak pola percubaan gagal berulang."
        : "Tiada tekanan gagal login dikesan.",
      tone: loginFailures24h >= 10 ? "danger" : loginFailures24h > 0 ? "warning" : "success",
    },
    {
      title: "Akaun disekat",
      value: bannedUsers.toLocaleString(),
      description: bannedUsers > 0
        ? "Akaun disekat perlu kekal dalam audit akses."
        : "Tiada akaun disekat direkod.",
      tone: bannedUsers > 0 ? "warning" : "success",
    },
  ];
}

function getLatestDashboardTrendLogins(trends: readonly LoginTrend[] | undefined) {
  if (!trends?.length) {
    return { latest: 0, previousAverage: 0 };
  }

  const loginCounts = trends
    .map((trend) => trend.logins)
    .filter((count) => Number.isFinite(count) && count >= 0);
  if (loginCounts.length === 0) {
    return { latest: 0, previousAverage: 0 };
  }

  const latest = loginCounts[loginCounts.length - 1] ?? 0;
  const previousCounts = loginCounts.slice(0, -1);
  const previousAverage = previousCounts.length > 0
    ? previousCounts.reduce((total, count) => total + count, 0) / previousCounts.length
    : latest;

  return { latest, previousAverage };
}

export function buildDashboardLoginRiskInsights(input: {
  recentLoginActivities?: readonly RecentLoginActivity[] | undefined;
  summary?: SummaryData | undefined;
  trends?: readonly LoginTrend[] | undefined;
}): DashboardLoginRiskInsight[] {
  const { recentLoginActivities, summary, trends } = input;
  const failedLogins = summary?.loginFailures24h ?? 0;
  const activeSessions = summary?.activeSessions ?? 0;
  const totalUsers = summary?.totalUsers ?? 0;
  const activeSessionRatio = totalUsers > 0 ? activeSessions / totalUsers : 0;
  const recentRows = recentLoginActivities ?? [];
  const recentActiveSessions = recentRows.filter((activity) => activity.status === "active").length;
  const { latest, previousAverage } = getLatestDashboardTrendLogins(trends);
  const spikeThreshold = Math.max(3, previousAverage * 1.5);
  const hasLoginSpike = latest >= spikeThreshold && latest > previousAverage;

  return [
    {
      title: "Failed login pressure",
      value: failedLogins.toLocaleString(),
      description: failedLogins > 0
        ? "Semak percubaan gagal berulang dan akaun yang mungkin perlu dikunci."
        : "Tiada percubaan gagal direkod dalam 24 jam terakhir.",
      tone: failedLogins >= 10 ? "danger" : failedLogins > 0 ? "warning" : "success",
    },
    {
      title: "Active session load",
      value: totalUsers > 0
        ? `${activeSessions.toLocaleString()} / ${totalUsers.toLocaleString()}`
        : activeSessions.toLocaleString(),
      description: activeSessionRatio >= 0.75
        ? "Sesi aktif tinggi berbanding jumlah pengguna; semak sesi lama atau peranti berganda."
        : "Beban sesi aktif berada dalam julat biasa.",
      tone: activeSessionRatio >= 0.75 ? "warning" : activeSessions > 0 ? "success" : "info",
    },
    {
      title: "Login trend check",
      value: `${latest.toLocaleString()} latest day`,
      description: hasLoginSpike
        ? "Login harian naik mendadak berbanding purata tempoh semasa."
        : "Tiada spike login besar dikesan pada hari terkini.",
      tone: hasLoginSpike ? "warning" : latest > 0 ? "success" : "info",
    },
    {
      title: "Recent session state",
      value: `${recentActiveSessions.toLocaleString()} active`,
      description: recentRows.length > 0
        ? "Rekod terbaru menunjukkan sesi aktif dan sesi tamat secara ringkas."
        : "Belum ada rekod login terbaru untuk dirumuskan.",
      tone: recentActiveSessions > 0 ? "success" : "info",
    },
  ];
}

export function resolveDashboardLoginRiskSummary(
  insights: readonly DashboardLoginRiskInsight[],
): DashboardLoginRiskSummary {
  const dangerCount = insights.filter((insight) => insight.tone === "danger").length;
  const warningCount = insights.filter((insight) => insight.tone === "warning").length;

  if (dangerCount > 0) {
    return {
      label: "Attention",
      description: `${dangerCount} signal memerlukan semakan segera.`,
      tone: "danger",
    };
  }

  if (warningCount > 0) {
    return {
      label: "Watch",
      description: `${warningCount} signal perlu dipantau.`,
      tone: "warning",
    };
  }

  return {
    label: "Normal",
    description: "Tiada tekanan login besar dikesan.",
    tone: "success",
  };
}

function clampDashboardLoginHealthScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildDashboardLoginHealthScore(
  insights: readonly DashboardLoginRiskInsight[],
): DashboardLoginHealthScore {
  const deductions: string[] = [];
  let deductionPoints = 0;

  for (const insight of insights) {
    const points = DASHBOARD_LOGIN_HEALTH_DEDUCTION_BY_TONE[insight.tone];
    if (points <= 0) {
      continue;
    }

    deductionPoints += points;
    deductions.push(`-${points} ${insight.title}: ${insight.value}`);
  }

  const rawScore = 100 - deductionPoints;
  const score = clampDashboardLoginHealthScore(rawScore);
  const hasDanger = insights.some((insight) => insight.tone === "danger");
  const hasWarning = insights.some((insight) => insight.tone === "warning");

  if (hasDanger || score < 70) {
    return {
      score,
      label: "Attention",
      description: "Skor rendah kerana ada signal login berisiko tinggi yang perlu disemak dahulu.",
      tone: "danger",
      deductions,
    };
  }

  if (hasWarning || score < 90) {
    return {
      score,
      label: "Watch",
      description: "Skor masih terkawal, tetapi ada signal kecil yang wajar dipantau hari ini.",
      tone: "warning",
      deductions,
    };
  }

  return {
    score,
    label: "Healthy",
    description: "Semua signal login utama berada dalam julat operasi biasa.",
    tone: "success",
    deductions,
  };
}

export function buildDashboardLoginRiskExplanation(input: {
  insights: readonly DashboardLoginRiskInsight[];
  summary: DashboardLoginRiskSummary;
}): DashboardLoginRiskExplanation {
  const elevatedItems = input.insights.filter((insight) => insight.tone === "danger" || insight.tone === "warning");
  const explanationItems = elevatedItems.length > 0 ? elevatedItems : input.insights;

  if (input.summary.tone === "danger") {
    return {
      headline: "Status Attention kerana sekurang-kurangnya satu signal login berada pada tahap bahaya.",
      items: [...explanationItems],
      footer: "Semak item berisiko dahulu, kemudian bandingkan dengan rekod login terbaru sebelum sekat atau reset akaun.",
    };
  }

  if (input.summary.tone === "warning") {
    return {
      headline: "Status Watch kerana ada signal kecil yang perlu dipantau, tetapi belum mencapai tahap kritikal.",
      items: [...explanationItems],
      footer: "Pantau perubahan dalam trend dan aktiviti terbaru sebelum ambil tindakan pentadbiran.",
    };
  }

  return {
    headline: "Status Normal kerana signal login utama berada dalam julat operasi biasa.",
    items: [...explanationItems],
    footer: "Teruskan pemantauan rutin dan gunakan rekod login terbaru jika ada laporan pengguna.",
  };
}

function hasDashboardRestrictedLogoutReason(activity: RecentLoginActivity) {
  return /banned|blocked|locked/i.test(activity.logoutReason ?? "");
}

function hasDashboardForcedLogoutReason(activity: RecentLoginActivity) {
  return /forced|kicked|revoked/i.test(activity.logoutReason ?? "");
}

function hasDashboardTimeoutLogoutReason(activity: RecentLoginActivity) {
  return /expired|idle|timeout/i.test(activity.logoutReason ?? "");
}

function parseDashboardRecentLoginTimeMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildDashboardSessionHealthItems(
  activities: readonly RecentLoginActivity[] | undefined,
  nowMs = Date.now(),
): DashboardSessionHealthItem[] {
  const recentRows = activities ?? [];
  let activeCount = 0;
  let freshCount = 0;
  let idleWatchCount = 0;
  let staleCount = 0;
  let timeoutEndedCount = 0;

  for (const activity of recentRows) {
    if (activity.status === "active") {
      activeCount += 1;
      const lastActivityMs = parseDashboardRecentLoginTimeMs(activity.lastActivityTime);

      if (lastActivityMs === null) {
        staleCount += 1;
        continue;
      }

      const ageMs = Math.max(0, nowMs - lastActivityMs);
      if (ageMs <= DASHBOARD_SESSION_FRESH_MAX_AGE_MS) {
        freshCount += 1;
      } else if (ageMs <= DASHBOARD_SESSION_IDLE_WATCH_MAX_AGE_MS) {
        idleWatchCount += 1;
      } else {
        staleCount += 1;
      }
      continue;
    }

    if (hasDashboardTimeoutLogoutReason(activity)) {
      timeoutEndedCount += 1;
    }
  }

  return [
    {
      id: "active",
      label: "Active now",
      value: activeCount,
      description: activeCount > 0
        ? "Sesi yang masih aktif dalam rekod login terbaru."
        : "Tiada sesi aktif dalam rekod terbaru.",
      tone: activeCount > 0 ? "info" : "success",
    },
    {
      id: "fresh",
      label: "Fresh",
      value: freshCount,
      description: freshCount > 0
        ? "Sesi aktif dengan aktiviti dalam 15 minit terakhir."
        : "Tiada sesi aktif yang baru bergerak dalam 15 minit.",
      tone: freshCount > 0 ? "success" : "info",
    },
    {
      id: "idle-watch",
      label: "Idle watch",
      value: idleWatchCount,
      description: idleWatchCount > 0
        ? "Sesi aktif yang tidak bergerak antara 15 hingga 60 minit."
        : "Tiada sesi aktif dalam zon idle watch.",
      tone: idleWatchCount > 0 ? "warning" : "success",
    },
    {
      id: "stale",
      label: "Stale",
      value: staleCount,
      description: staleCount > 0
        ? "Sesi aktif melebihi 60 minit tanpa aktiviti atau tiada timestamp sah."
        : "Tiada sesi aktif stale dalam rekod terbaru.",
      tone: staleCount > 0 ? "danger" : "success",
    },
    {
      id: "timeout-ended",
      label: "Ended by timeout",
      value: timeoutEndedCount,
      description: timeoutEndedCount > 0
        ? "Sesi terbaru yang tamat kerana idle, expired, atau timeout."
        : "Tiada sesi tamat kerana timeout dalam rekod terbaru.",
      tone: timeoutEndedCount >= 2 ? "warning" : timeoutEndedCount > 0 ? "info" : "success",
    },
  ];
}

function normalizeDashboardBrowserName(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function resolveMostCommonDashboardBrowser(activities: readonly RecentLoginActivity[]) {
  const counts = new Map<string, number>();

  for (const activity of activities) {
    const browser = normalizeDashboardBrowserName(activity.browser);
    if (!browser) {
      continue;
    }
    counts.set(browser, (counts.get(browser) ?? 0) + 1);
  }

  let topBrowser: string | null = null;
  let topCount = 0;
  for (const [browser, count] of counts) {
    if (count > topCount || (count === topCount && topBrowser !== null && browser.localeCompare(topBrowser) < 0)) {
      topBrowser = browser;
      topCount = count;
    }
  }

  return topBrowser ? { browser: topBrowser, count: topCount } : null;
}

function resolveMostActiveDashboardUser(topUsers: readonly TopUser[] | undefined) {
  const users = topUsers ?? [];
  let selected: TopUser | null = null;

  for (const user of users) {
    if (!Number.isFinite(user.loginCount) || user.loginCount < 0) {
      continue;
    }
    if (
      selected === null
      || user.loginCount > selected.loginCount
      || (user.loginCount === selected.loginCount && user.username.localeCompare(selected.username) < 0)
    ) {
      selected = user;
    }
  }

  return selected;
}

function resolveDashboardPeakLoginWindow(peakHours: readonly PeakHour[] | undefined) {
  const hours = peakHours ?? [];
  let selected: PeakHour | null = null;

  for (const hour of hours) {
    if (!Number.isInteger(hour.hour) || hour.hour < 0 || hour.hour > 23 || !Number.isFinite(hour.count) || hour.count < 0) {
      continue;
    }
    if (
      selected === null
      || hour.count > selected.count
      || (hour.count === selected.count && hour.hour < selected.hour)
    ) {
      selected = hour;
    }
  }

  return selected;
}

function formatDashboardLogoutReasonLabel(value: string | null | undefined) {
  const normalized = value
    ?.replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveTopDashboardAttentionReason(activities: readonly RecentLoginActivity[]) {
  const counts = new Map<string, number>();

  for (const activity of activities) {
    if (!isDashboardRecentLoginAttentionActivity(activity)) {
      continue;
    }
    const reason = formatDashboardLogoutReasonLabel(activity.logoutReason);
    if (!reason) {
      continue;
    }
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  let topReason: string | null = null;
  let topCount = 0;
  for (const [reason, count] of counts) {
    if (count > topCount || (count === topCount && topReason !== null && reason.localeCompare(topReason) < 0)) {
      topReason = reason;
      topCount = count;
    }
  }

  return topReason ? { reason: topReason, count: topCount, total: Array.from(counts.values()).reduce((sum, count) => sum + count, 0) } : null;
}

export function buildDashboardLoginPatternSummary(input: {
  peakHours?: readonly PeakHour[] | undefined;
  recentLoginActivities?: readonly RecentLoginActivity[] | undefined;
  summary?: SummaryData | undefined;
  topUsers?: readonly TopUser[] | undefined;
}): DashboardLoginPatternSummary {
  const recentRows = input.recentLoginActivities ?? [];
  const mostActiveUser = resolveMostActiveDashboardUser(input.topUsers);
  const commonBrowser = resolveMostCommonDashboardBrowser(recentRows);
  const peakWindow = resolveDashboardPeakLoginWindow(input.peakHours);
  const attentionReason = resolveTopDashboardAttentionReason(recentRows);
  const failedLogins = input.summary?.loginFailures24h ?? 0;
  const bannedUsers = input.summary?.bannedUsers ?? 0;
  const attentionTotal = attentionReason?.total ?? 0;
  const hasAttention = attentionTotal >= 3 || failedLogins >= 10 || bannedUsers > 0;
  const hasWatch = Boolean(attentionReason) || failedLogins > 0;
  const statusLabel = hasAttention ? "Attention" : hasWatch ? "Watch" : recentRows.length > 0 ? "Normal" : "Learning";
  const statusTone = hasAttention ? "danger" : hasWatch ? "warning" : recentRows.length > 0 ? "success" : "info";
  const operatorNote = hasAttention
    ? "Semak pola akses yang berulang sebelum ambil tindakan akaun atau sesi."
    : hasWatch
      ? "Ada signal kecil untuk dipantau, tetapi belum menunjukkan tekanan kritikal."
      : recentRows.length > 0
        ? "Pola login terbaru kelihatan stabil untuk pemantauan biasa."
        : "Data login belum cukup untuk membuat kesimpulan pola operasi.";

  return {
    statusLabel,
    statusTone,
    operatorNote,
    facts: [
      {
        id: "top-account",
        label: "Most active account",
        value: mostActiveUser ? mostActiveUser.username : "Not enough data",
        description: mostActiveUser
          ? `${mostActiveUser.loginCount.toLocaleString()} login dalam tempoh semasa. Peranan: ${mostActiveUser.role}.`
          : "Belum ada ranking pengguna aktif untuk dirumuskan.",
        tone: mostActiveUser ? "info" : "success",
      },
      {
        id: "common-browser",
        label: "Common browser",
        value: commonBrowser ? commonBrowser.browser : "Not enough data",
        description: commonBrowser
          ? `${commonBrowser.count.toLocaleString()} rekod terbaru menggunakan browser ini.`
          : "Belum ada metadata browser yang cukup dalam rekod terbaru.",
        tone: commonBrowser ? "info" : "success",
      },
      {
        id: "peak-window",
        label: "Peak login window",
        value: peakWindow ? formatDashboardHour(peakWindow.hour) : "Not enough data",
        description: peakWindow
          ? `${peakWindow.count.toLocaleString()} login direkod pada window ini.`
          : "Belum ada taburan waktu login yang cukup untuk peak window.",
        tone: peakWindow && peakWindow.count > 0 ? "info" : "success",
      },
      {
        id: "attention-reason",
        label: "Attention reason",
        value: attentionReason ? attentionReason.reason : "No flagged reason",
        description: attentionReason
          ? `${attentionReason.count.toLocaleString()} daripada ${attentionReason.total.toLocaleString()} attention event berkaitan reason ini.`
          : "Tiada logout reason berisiko tinggi dalam rekod terbaru.",
        tone: attentionReason && attentionReason.total >= 3 ? "danger" : attentionReason ? "warning" : "success",
      },
    ],
  };
}

function pushDashboardActionQueueItem(
  items: DashboardActionQueueItem[],
  item: DashboardActionQueueItem,
) {
  if (!items.some((existing) => existing.id === item.id)) {
    items.push(item);
  }
}

export function buildDashboardActionQueueItems(input: {
  recentLoginActivities?: readonly RecentLoginActivity[] | undefined;
  summary?: SummaryData | undefined;
  trends?: readonly LoginTrend[] | undefined;
}): DashboardActionQueueItem[] {
  const { recentLoginActivities, summary, trends } = input;
  const items: DashboardActionQueueItem[] = [];
  const recentRows = recentLoginActivities ?? [];
  const failedLogins = summary?.loginFailures24h ?? 0;
  const bannedUsers = summary?.bannedUsers ?? 0;
  const activeSessions = summary?.activeSessions ?? 0;
  const totalUsers = summary?.totalUsers ?? 0;
  const activeSessionRatio = totalUsers > 0 ? activeSessions / totalUsers : 0;
  const recentActiveSessions = recentRows.filter((activity) => activity.status === "active");
  const timeoutRows = recentRows.filter(hasDashboardTimeoutLogoutReason);
  const restrictedRow = recentRows.find(hasDashboardRestrictedLogoutReason);
  const forcedRow = recentRows.find(hasDashboardForcedLogoutReason);
  const { latest, previousAverage } = getLatestDashboardTrendLogins(trends);
  const spikeThreshold = Math.max(3, previousAverage * 1.5);
  const hasLoginSpike = latest >= spikeThreshold && latest > previousAverage;

  if (failedLogins >= 10) {
    pushDashboardActionQueueItem(items, {
      id: "failed-login-pressure",
      title: "Review failed login pressure",
      description: `${failedLogins.toLocaleString()} failed login attempts were recorded in the last 24 hours. Compare activity and audit logs before locking accounts.`,
      priority: "high",
      actionLabel: "Open activity logs",
      targetHref: buildPathForPage("activity"),
    });
  }

  if (restrictedRow || bannedUsers > 0) {
    pushDashboardActionQueueItem(items, {
      id: "restricted-account-review",
      title: "Check restricted account events",
      description: restrictedRow
        ? `${restrictedRow.username} has a recent restricted-account logout reason. Confirm the action was expected.`
        : `${bannedUsers.toLocaleString()} banned account record needs to remain aligned with access audit notes.`,
      priority: "high",
      actionLabel: "Open audit logs",
      targetHref: buildPathForPage("audit"),
    });
  }

  if (forcedRow) {
    pushDashboardActionQueueItem(items, {
      id: "forced-session-review",
      title: "Verify forced session end",
      description: `${forcedRow.username} has a recent forced session end. Confirm whether this came from an operator action or policy enforcement.`,
      priority: "medium",
      actionLabel: "Open activity logs",
      targetHref: buildPathForPage("activity"),
    });
  }

  if (timeoutRows.length >= 2) {
    pushDashboardActionQueueItem(items, {
      id: "repeated-timeout-review",
      title: "Watch repeated timeout sessions",
      description: `${timeoutRows.length.toLocaleString()} recent sessions ended by timeout or idle expiry. Look for shared browser, device, or network patterns.`,
      priority: "medium",
      actionLabel: "Open activity logs",
      targetHref: buildPathForPage("activity"),
    });
  }

  if (hasLoginSpike) {
    pushDashboardActionQueueItem(items, {
      id: "login-trend-spike",
      title: "Review login trend spike",
      description: `Latest login count is ${latest.toLocaleString()}, above the current trend baseline. Check whether this matches expected operations.`,
      priority: "medium",
      actionLabel: "Open audit logs",
      targetHref: buildPathForPage("audit"),
    });
  }

  if (activeSessionRatio >= 0.75 && activeSessions > 0) {
    pushDashboardActionQueueItem(items, {
      id: "active-session-load",
      title: "Inspect active session load",
      description: `${activeSessions.toLocaleString()} of ${totalUsers.toLocaleString()} users currently have active sessions. Review stale sessions if this is unusual.`,
      priority: "medium",
      actionLabel: "Open activity logs",
      targetHref: buildPathForPage("activity"),
    });
  }

  if (recentActiveSessions.length > 0) {
    pushDashboardActionQueueItem(items, {
      id: "active-session-check",
      title: "Spot-check active sessions",
      description: `${recentActiveSessions.length.toLocaleString()} recent active session${recentActiveSessions.length === 1 ? "" : "s"} visible. Confirm device and network context if access looks unfamiliar.`,
      priority: "low",
      actionLabel: "Review recent activity",
      targetHref: buildPathForPage("activity"),
    });
  }

  return items.slice(0, DASHBOARD_ACTION_QUEUE_MAX_ITEMS);
}

function formatDashboardPdfNumber(value: number | null | undefined) {
  return (typeof value === "number" && Number.isFinite(value) ? value : 0).toLocaleString();
}

function buildDashboardPdfTrendRows(trends: readonly LoginTrend[] | undefined) {
  const trendRows = trends ?? [];
  const latestTrend = trendRows.length > 0 ? trendRows[trendRows.length - 1] : undefined;
  if (!latestTrend) {
    return ["Login trend: Not enough data for the selected range."];
  }

  const totalLogins = trendRows.reduce((total, trend) => total + Math.max(0, trend.logins), 0);
  const totalLogouts = trendRows.reduce((total, trend) => total + Math.max(0, trend.logouts), 0);

  return [
    `Selected trend range: ${trendRows.length.toLocaleString()} day${trendRows.length === 1 ? "" : "s"}.`,
    `Latest day (${formatDashboardDate(latestTrend.date)}): ${latestTrend.logins.toLocaleString()} logins and ${latestTrend.logouts.toLocaleString()} logouts.`,
    `Range total: ${totalLogins.toLocaleString()} logins and ${totalLogouts.toLocaleString()} logouts.`,
  ];
}

function buildDashboardPdfRecentActivityRows(
  activities: readonly RecentLoginActivity[] | undefined,
) {
  const recentRows = (activities ?? []).slice(0, 5);
  if (recentRows.length === 0) {
    return ["Recent activity: No recent login rows are available yet."];
  }

  return recentRows.map((activity) => {
    const status = resolveDashboardRecentLoginStatusMeta(activity.status).label;
    const reason = formatDashboardLogoutReasonLabel(activity.logoutReason) ?? "None";
    return `${activity.username} (${activity.role}) - ${status}; last activity ${formatDashboardRecentLoginTime(activity.lastActivityTime)}; logout reason: ${reason}.`;
  });
}

export function buildDashboardPdfSummaryReport(
  input: DashboardPdfSummaryInput,
  generatedAt = new Date(),
): DashboardPdfSummaryReport {
  const pattern = buildDashboardLoginPatternSummary({
    peakHours: input.peakHours,
    recentLoginActivities: input.recentLoginActivities,
    summary: input.summary,
    topUsers: input.topUsers,
  });
  const healthItems = buildDashboardSessionHealthItems(input.recentLoginActivities, generatedAt.getTime());
  const actionItems = buildDashboardActionQueueItems({
    recentLoginActivities: input.recentLoginActivities,
    summary: input.summary,
    trends: input.trends,
  });

  return {
    generatedAtLabel: formatDateTimeDDMMYYYY(generatedAt, { includeSeconds: true }),
    statusLabel: pattern.statusLabel,
    subtitle: pattern.operatorNote,
    title: "Dashboard Login Operational Summary",
    sections: [
      {
        title: "Executive Summary",
        rows: [
          `Overall status: ${pattern.statusLabel}.`,
          `Operator note: ${pattern.operatorNote}`,
          `Generated: ${formatDateTimeDDMMYYYY(generatedAt, { includeSeconds: true })}.`,
        ],
      },
      {
        title: "KPI Snapshot",
        rows: [
          `Total users: ${formatDashboardPdfNumber(input.summary?.totalUsers)}.`,
          `Active sessions: ${formatDashboardPdfNumber(input.summary?.activeSessions)}.`,
          `Logins today: ${formatDashboardPdfNumber(input.summary?.loginsToday)}.`,
          `Failed logins (24h): ${formatDashboardPdfNumber(input.summary?.loginFailures24h)}.`,
          `Banned users: ${formatDashboardPdfNumber(input.summary?.bannedUsers)}.`,
          `Total imports: ${formatDashboardPdfNumber(input.summary?.totalImports)}.`,
          `Total data rows: ${formatDashboardPdfNumber(input.summary?.totalDataRows)}.`,
        ],
      },
      {
        title: "Login Pattern Summary",
        rows: pattern.facts.map((fact) => `${fact.label}: ${fact.value} - ${fact.description}`),
      },
      {
        title: "Session Health Summary",
        rows: healthItems.map((item) => `${item.label}: ${item.value.toLocaleString()} - ${item.description}`),
      },
      {
        title: "Trend Summary",
        rows: buildDashboardPdfTrendRows(input.trends),
      },
      {
        title: "Action Queue",
        rows: actionItems.length > 0
          ? actionItems.map((item) => `${item.priority.toUpperCase()}: ${item.title} - ${item.description}`)
          : ["No immediate review items. Continue normal monitoring."],
      },
      {
        title: "Recent Activity Summary",
        rows: buildDashboardPdfRecentActivityRows(input.recentLoginActivities),
      },
    ],
  };
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

function getDashboardPdfThemeColors(theme: DashboardPdfTheme) {
  const isDark = theme === "dark";
  return {
    accent: (isDark ? [96, 165, 250] : [37, 99, 235]) as DashboardPdfRgb,
    card: (isDark ? [22, 32, 48] : [248, 250, 252]) as DashboardPdfRgb,
    line: (isDark ? [71, 85, 105] : [203, 213, 225]) as DashboardPdfRgb,
    mutedText: (isDark ? [148, 163, 184] : [100, 116, 139]) as DashboardPdfRgb,
    page: (isDark ? [15, 23, 42] : [255, 255, 255]) as DashboardPdfRgb,
    primaryText: (isDark ? [248, 250, 252] : [15, 23, 42]) as DashboardPdfRgb,
    softAccent: (isDark ? [30, 41, 59] : [239, 246, 255]) as DashboardPdfRgb,
    surface: (isDark ? [30, 41, 59] : [255, 255, 255]) as DashboardPdfRgb,
  };
}

function setDashboardPdfFillColor(pdf: DashboardJsPdfDocument, color: DashboardPdfRgb) {
  pdf.setFillColor(color[0], color[1], color[2]);
}

function setDashboardPdfDrawColor(pdf: DashboardJsPdfDocument, color: DashboardPdfRgb) {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function setDashboardPdfTextColor(pdf: DashboardJsPdfDocument, color: DashboardPdfRgb) {
  pdf.setTextColor(color[0], color[1], color[2]);
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
  const colors = getDashboardPdfThemeColors(theme);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  setDashboardPdfFillColor(pdf, colors.page);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  return { pageWidth, pageHeight };
}

function writeDashboardPdfHeader(
  pdf: DashboardJsPdfDocument,
  theme: DashboardPdfTheme,
  modeLabel: string,
) {
  const colors = getDashboardPdfThemeColors(theme);
  const { pageWidth } = setDashboardPdfPageTheme(pdf, theme);

  setDashboardPdfFillColor(pdf, colors.surface);
  setDashboardPdfDrawColor(pdf, colors.line);
  pdf.rect(DASHBOARD_PDF_MARGIN_MM, 10, pageWidth - DASHBOARD_PDF_MARGIN_MM * 2, 24, "FD");

  setDashboardPdfFillColor(pdf, colors.accent);
  pdf.rect(DASHBOARD_PDF_MARGIN_MM, 10, 3, 24, "F");

  setDashboardPdfFillColor(pdf, colors.softAccent);
  pdf.rect(pageWidth - DASHBOARD_PDF_MARGIN_MM - 39, 15, 29, 9, "F");
  setDashboardPdfTextColor(pdf, colors.accent);
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  pdf.text(modeLabel, pageWidth - DASHBOARD_PDF_MARGIN_MM - 34, 21);

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  setDashboardPdfTextColor(pdf, colors.mutedText);
  pdf.text("SQR SYSTEM", DASHBOARD_PDF_MARGIN_MM + 8, 17);

  pdf.setFontSize(17);
  pdf.setFont("helvetica", "bold");
  setDashboardPdfTextColor(pdf, colors.primaryText);
  pdf.text("Dashboard Login Report", DASHBOARD_PDF_MARGIN_MM + 8, 25);

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  setDashboardPdfTextColor(pdf, colors.mutedText);
  pdf.text(
    `Generated ${formatDateTimeDDMMYYYY(new Date(), { includeSeconds: true })} - Login activity and system analytics`,
    DASHBOARD_PDF_MARGIN_MM + 8,
    31,
  );

  setDashboardPdfDrawColor(pdf, colors.line);
  pdf.setLineWidth(0.5);
  pdf.line(DASHBOARD_PDF_MARGIN_MM, DASHBOARD_PDF_HEADER_HEIGHT_MM, pageWidth - DASHBOARD_PDF_MARGIN_MM, DASHBOARD_PDF_HEADER_HEIGHT_MM);
}

function writeDashboardPdfFooter(
  pdf: DashboardJsPdfDocument,
  theme: DashboardPdfTheme,
  pageNumber: number,
  pageCount: number,
) {
  const colors = getDashboardPdfThemeColors(theme);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  pdf.setFontSize(8);
  setDashboardPdfTextColor(pdf, colors.mutedText);
  pdf.text("Sumbangan Query Rahmah (SQR) System", DASHBOARD_PDF_MARGIN_MM, pageHeight - 6);
  pdf.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - 34, pageHeight - 6);
}

export function resolveDashboardCanvasPdfSlices(
  canvasWidth: number,
  canvasHeight: number,
  pageWidth: number,
  pageHeight: number,
): DashboardCanvasPdfSlice[] {
  const safeCanvasWidth = Math.max(1, Math.ceil(canvasWidth));
  const safeCanvasHeight = Math.max(1, Math.ceil(canvasHeight));
  const imageWidth = pageWidth - DASHBOARD_PDF_MARGIN_MM * 2;
  const availableHeight = pageHeight
    - DASHBOARD_PDF_HEADER_HEIGHT_MM
    - DASHBOARD_PDF_FOOTER_HEIGHT_MM;
  const imageScale = imageWidth / safeCanvasWidth;
  const sourceSliceHeight = Math.max(1, Math.floor(availableHeight / imageScale));
  const slices: DashboardCanvasPdfSlice[] = [];

  for (let sourceY = 0; sourceY < safeCanvasHeight; sourceY += sourceSliceHeight) {
    const sourceHeight = Math.min(sourceSliceHeight, safeCanvasHeight - sourceY);
    slices.push({
      sourceY,
      sourceHeight,
      imageX: DASHBOARD_PDF_MARGIN_MM,
      imageY: DASHBOARD_PDF_HEADER_HEIGHT_MM + 4,
      imageWidth,
      imageHeight: sourceHeight * imageScale,
    });
  }

  return slices;
}

function saveDashboardCanvasPdf(
  pdf: DashboardJsPdfDocument,
  canvas: HTMLCanvasElement,
  theme: DashboardPdfTheme,
) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const slices = resolveDashboardCanvasPdfSlices(
    canvas.width,
    canvas.height,
    pageWidth,
    pageHeight,
  );
  const sliceCanvas = document.createElement("canvas");
  const sliceContext = sliceCanvas.getContext("2d");
  if (!sliceContext) {
    throw new Error("Dashboard PDF canvas renderer is unavailable.");
  }

  try {
    sliceCanvas.width = canvas.width;
    for (const [index, slice] of slices.entries()) {
      if (index > 0) {
        pdf.addPage();
      }

      writeDashboardPdfHeader(pdf, theme, "VISUAL");
      sliceCanvas.height = slice.sourceHeight;
      sliceContext.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      sliceContext.drawImage(
        canvas,
        0,
        slice.sourceY,
        canvas.width,
        slice.sourceHeight,
        0,
        0,
        canvas.width,
        slice.sourceHeight,
      );
      pdf.addImage(
        sliceCanvas.toDataURL("image/png", 1.0),
        "PNG",
        slice.imageX,
        slice.imageY,
        slice.imageWidth,
        slice.imageHeight,
      );
      writeDashboardPdfFooter(pdf, theme, index + 1, slices.length);
    }
  } finally {
    sliceCanvas.width = 0;
    sliceCanvas.height = 0;
  }
}

function isDashboardPdfSummaryReport(content: DashboardFallbackPdfContent): content is DashboardPdfSummaryReport {
  return !Array.isArray(content);
}

function buildDashboardFallbackPdfRows(content: DashboardFallbackPdfContent): DashboardFallbackPdfRow[] {
  if (!isDashboardPdfSummaryReport(content)) {
    const safeLines = content.length > 0 ? content : ["Dashboard data is currently unavailable."];
    return safeLines.map((line) => ({ kind: "body", text: line }));
  }

  const rows: DashboardFallbackPdfRow[] = [
    { kind: "body", text: `Status: ${content.statusLabel}` },
    { kind: "body", text: `Generated: ${content.generatedAtLabel}` },
    { kind: "body", text: content.subtitle },
  ];

  for (const section of content.sections) {
    rows.push({ kind: "section", text: section.title });
    const sectionRows = section.rows.length > 0 ? section.rows : ["No data available."];
    for (const row of sectionRows) {
      rows.push({ kind: "body", text: row });
    }
  }

  return rows;
}

function resolveDashboardFallbackPdfRowHeight(row: Pick<DashboardFallbackPdfLayoutRow, "kind" | "lines">) {
  const lineHeight = row.kind === "section" ? 5 : 4.6;
  const basePadding = row.kind === "section" ? 4 : 5;
  const minimumHeight = row.kind === "section" ? 8 : DASHBOARD_PDF_FALLBACK_ROW_MIN_HEIGHT_MM;
  return Math.max(minimumHeight, row.lines.length * lineHeight + basePadding);
}

export function writeDashboardFallbackPdf(
  pdf: DashboardJsPdfDocument,
  content: DashboardFallbackPdfContent,
  theme: DashboardPdfTheme,
) {
  const colors = getDashboardPdfThemeColors(theme);
  const isStructuredReport = isDashboardPdfSummaryReport(content);
  const rows = buildDashboardFallbackPdfRows(content);
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - DASHBOARD_PDF_MARGIN_MM * 2;
  const textWidth = contentWidth - 8;
  const lineHeight = 4.6;
  const pageContentStartY = DASHBOARD_PDF_HEADER_HEIGHT_MM + 6;
  const pageContentEndY = pageHeight - DASHBOARD_PDF_FOOTER_HEIGHT_MM - 2;
  const pages: DashboardFallbackPdfLayoutRow[][] = [[]];
  let cursorY = pageContentStartY;

  for (const row of rows) {
    const wrapped = pdf.splitTextToSize(row.text, textWidth) as string[];
    const layoutRow: DashboardFallbackPdfLayoutRow = { ...row, lines: wrapped };
    const rowHeight = resolveDashboardFallbackPdfRowHeight(layoutRow);
    if (cursorY + rowHeight > pageContentEndY && pages[pages.length - 1]!.length > 0) {
      pages.push([]);
      cursorY = pageContentStartY;
    }

    pages[pages.length - 1]!.push(layoutRow);
    cursorY += rowHeight + DASHBOARD_PDF_ROW_GAP_MM;
  }

  pages.forEach((pageRows, pageIndex) => {
    if (pageIndex > 0) {
      pdf.addPage();
    }

    writeDashboardPdfHeader(pdf, theme, "SUMMARY");
    setDashboardPdfFillColor(pdf, colors.softAccent);
    setDashboardPdfDrawColor(pdf, colors.line);
    pdf.rect(DASHBOARD_PDF_MARGIN_MM, pageContentStartY - 2, contentWidth, 11, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    setDashboardPdfTextColor(pdf, colors.primaryText);
    pdf.text(
      isStructuredReport ? "Operational PDF summary" : "Readable dashboard summary",
      DASHBOARD_PDF_MARGIN_MM + 4,
      pageContentStartY + 5,
    );

    if (isStructuredReport && pageIndex === 0) {
      setDashboardPdfFillColor(pdf, colors.accent);
      pdf.rect(pageWidth - DASHBOARD_PDF_MARGIN_MM - 42, pageContentStartY, 32, 7, "F");
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      setDashboardPdfTextColor(pdf, theme === "dark" ? colors.page : ([255, 255, 255] as DashboardPdfRgb));
      pdf.text(content.statusLabel, pageWidth - DASHBOARD_PDF_MARGIN_MM - 38, pageContentStartY + 4.8);
    }

    let lineY = pageContentStartY + 16;
    for (const [rowIndex, rowLines] of pageRows.entries()) {
      const rowHeight = resolveDashboardFallbackPdfRowHeight(rowLines);
      const isSection = rowLines.kind === "section";
      setDashboardPdfFillColor(pdf, isSection ? colors.softAccent : rowIndex % 2 === 0 ? colors.card : colors.surface);
      setDashboardPdfDrawColor(pdf, colors.line);
      pdf.rect(DASHBOARD_PDF_MARGIN_MM, lineY - 4, contentWidth, rowHeight, "FD");

      pdf.setFont(
        "helvetica",
        isSection || (!isStructuredReport && rowIndex === 0 && pageIndex === 0) ? "bold" : "normal",
      );
      pdf.setFontSize(isSection ? 10 : !isStructuredReport && rowIndex === 0 && pageIndex === 0 ? 11 : 8.8);
      setDashboardPdfTextColor(pdf, isSection ? colors.accent : colors.primaryText);
      let wrappedLineY = lineY + 2;
      for (const wrappedLine of rowLines.lines) {
        pdf.text(wrappedLine, DASHBOARD_PDF_MARGIN_MM + 4, wrappedLineY);
        wrappedLineY += lineHeight;
      }

      lineY += rowHeight + DASHBOARD_PDF_ROW_GAP_MM;
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

export async function exportDashboardToPdf(
  element: HTMLDivElement,
  summaryInput?: DashboardPdfSummaryInput,
) {
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
    const fallbackContent = summaryInput
      ? buildDashboardPdfSummaryReport(summaryInput)
      : collectDashboardFallbackPdfLines(element);
    try {
      writeDashboardFallbackPdf(fallbackPdf, fallbackContent, theme);
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
