import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Activity, Database, FileText, LogIn, ShieldOff, Users, AlertTriangle } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { DashboardActionQueue } from "@/pages/dashboard/DashboardActionQueue";
import { DashboardChartsGrid } from "@/pages/dashboard/DashboardChartsGrid";
import { DashboardLoginPatternSummary } from "@/pages/dashboard/DashboardLoginPatternSummary";
import { DashboardLoginRiskInsights } from "@/pages/dashboard/DashboardLoginRiskInsights";
import { DashboardPageHeader } from "@/pages/dashboard/DashboardPageHeader";
import { DashboardRecentLoginActivity } from "@/pages/dashboard/DashboardRecentLoginActivity";
import { DashboardSectionRenderFallback } from "@/pages/dashboard/DashboardSectionRenderBoundary";
import { DashboardSessionHealthStrip } from "@/pages/dashboard/DashboardSessionHealthStrip";
import { DashboardSnapshotSection } from "@/pages/dashboard/DashboardSnapshotSection";
import { DashboardSummaryCards } from "@/pages/dashboard/DashboardSummaryCards";
import {
  DashboardUserInsightsGrid,
  sanitizeDashboardRoleDistributionChartSurface,
} from "@/pages/dashboard/DashboardUserInsightsGrid";
import type { SummaryCardItem } from "@/pages/dashboard/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
type DashboardRoleChartSurface = Parameters<typeof sanitizeDashboardRoleDistributionChartSurface>[0];

const summaryCards: SummaryCardItem[] = [
  { title: "Total Users", value: 10, icon: Users, color: "text-blue-600 dark:text-primary" },
  { title: "Active Sessions", value: 4, icon: Activity, color: "text-green-600 dark:text-green-400" },
  { title: "Logins Today", value: 8, icon: LogIn, color: "text-purple-600 dark:text-purple-400" },
  { title: "Failed Logins (24h)", value: 2, icon: AlertTriangle, color: "text-rose-600 dark:text-rose-400" },
  { title: "Banned Users", value: 1, icon: ShieldOff, color: "text-red-600 dark:text-red-400" },
  { title: "Total Data Rows", value: 1200, icon: Database, color: "text-orange-600 dark:text-orange-400" },
  { title: "Total Imports", value: 25, icon: FileText, color: "text-teal-600 dark:text-teal-400" },
  { title: "Backup Actions (24h)", value: 0, icon: FileText, color: "text-cyan-700 dark:text-cyan-300" },
  {
    title: "Stale Record Conflicts (24h)",
    value: 3,
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
  },
];

test("DashboardPageHeader keeps compact solid actions and status badges", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardPageHeader, {
      isMobile: false,
      kpiCount: 9,
      trendDays: 14,
      exportingPdf: false,
      exportBlockReason: null,
      refreshing: false,
      onExportPdf: () => undefined,
      onRefresh: () => undefined,
    }),
  );

  assert.match(markup, /Login &amp; Access Dashboard/);
  assert.match(markup, /Trend 14d/);
  assert.match(markup, /9 KPI akses/);
  assert.match(markup, /Auto refresh/);
  assert.match(markup, /button-export-pdf/);
  assert.match(markup, /button-refresh-dashboard/);
  assert.match(markup, /type="button"/);
  assert.match(markup, /border-border\/60 bg-background shadow-sm/);
});

test("DashboardSummaryCards separates primary and supporting metrics into compact sections", () => {
  const source = readFileSync(path.resolve(__dirname, "../DashboardSummaryCards.tsx"), "utf8");
  const markup = renderToStaticMarkup(
    createElement(DashboardSummaryCards, {
      items: summaryCards,
      summaryLoading: false,
    }),
  );

  assert.match(markup, /Total Users/);
  assert.match(markup, /Active Sessions/);
  assert.match(markup, /Supporting Signals/);
  assert.match(markup, /Operational context/);
  assert.match(markup, /rounded-2xl border border-border\/60 bg-background shadow-sm/);
  assert.match(markup, /rounded-2xl border border-border\/60 bg-muted\/10 shadow-none/);
  assert.match(source, /export const DashboardSummaryCards = memo\(DashboardSummaryCardsImpl\)/);
  assert.match(source, /items\.slice\(0, 4\), \[items\]/);
  assert.match(source, /items\.slice\(4\), \[items\]/);
});

test("DashboardSummaryCards hides loading skeletons from assistive technology", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardSummaryCards, {
      items: summaryCards,
      summaryLoading: true,
    }),
  );

  assert.doesNotMatch(markup, /aria-label="Loading value"/);
  assert.match(markup, /animate-pulse" aria-hidden="true"/);
});

test("DashboardSnapshotSection surfaces metric count badge with compact summary copy", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardSnapshotSection, {
      summary: {
        activeSessions: 4,
        bannedUsers: 1,
        collectionRecordVersionConflicts24h: 3,
        loginsToday: 8,
        totalDataRows: 1200,
        totalImports: 25,
        totalUsers: 10,
        loginFailures24h: 2,
      },
      summaryCards: summaryCards.slice(0, 3),
      summaryErrorMessage: null,
      summaryLoading: false,
      summaryRetrying: false,
      onRetrySummary: () => undefined,
    }),
  );

  assert.match(markup, /Login Snapshot/);
  assert.match(markup, /3 metrics/);
  assert.match(markup, /fast operator review/);
  assert.match(markup, /Access watchlist/);
  assert.match(markup, /Login readiness at a glance/);
  assert.match(markup, /Gagal login 24j/);
});

test("DashboardSnapshotSection renders a retryable local error state", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardSnapshotSection, {
      summary: undefined,
      summaryCards,
      summaryErrorMessage: "Ringkasan tidak dapat dicapai.",
      summaryLoading: false,
      summaryRetrying: false,
      onRetrySummary: () => undefined,
    }),
  );

  assert.match(markup, /Ringkasan dashboard gagal dimuat/);
  assert.match(markup, /Ringkasan tidak dapat dicapai\./);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Cuba lagi/);
  assert.doesNotMatch(markup, /Total Users/);
});

test("Dashboard wraps major dashboard regions in accessible render error boundaries", () => {
  const dashboardSource = readFileSync(path.resolve(__dirname, "../../Dashboard.tsx"), "utf8");
  const deferredSource = readFileSync(path.resolve(__dirname, "../DashboardDeferredSections.tsx"), "utf8");
  const fallbackMarkup = renderToStaticMarkup(
    createElement(DashboardSectionRenderFallback, {
      sectionName: "Carta dashboard",
      onRetry: () => undefined,
    }),
  );

  assert.match(dashboardSource, /<DashboardSectionRenderBoundary/);
  assert.match(dashboardSource, /sectionName="Ringkasan dashboard"/);
  assert.match(deferredSource, /Dashboard login review workspace/);
  assert.match(deferredSource, /<DashboardActionQueue/);
  assert.match(deferredSource, /<DashboardSessionHealthStrip/);
  assert.match(deferredSource, /<DashboardLoginPatternSummary/);
  assert.match(deferredSource, /xl:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1\.1fr\)\]/);
  assert.match(deferredSource, /sectionName="Carta dashboard"/);
  assert.match(deferredSource, /sectionName="Insight risiko login dashboard"/);
  assert.match(deferredSource, /sectionName="Aktiviti login dashboard"/);
  assert.match(deferredSource, /sectionName="Insight pengguna dashboard"/);
  assert.match(fallbackMarkup, /role="alert"/);
  assert.match(fallbackMarkup, /aria-live="assertive"/);
  assert.match(fallbackMarkup, /aria-label="Carta dashboard tidak dapat dimuatkan"/);
  assert.match(fallbackMarkup, /Carta dashboard tidak dapat dimuatkan\./);
  assert.match(fallbackMarkup, /Bahagian ini gagal dirender/);
  assert.match(fallbackMarkup, /Cuba lagi/);
  assert.match(fallbackMarkup, /type="button"/);
});

test("DashboardActionQueue renders prioritized operator actions without lifecycle effects", () => {
  const source = readFileSync(path.resolve(__dirname, "../DashboardActionQueue.tsx"), "utf8");
  const markup = renderToStaticMarkup(
    createElement(DashboardActionQueue, {
      loading: false,
      recentLoginActivities: [
        {
          browser: "Chrome",
          ipAddress: "10.42.x.x",
          lastActivityTime: "2026-05-06T02:30:00Z",
          loginTime: "2026-05-06T02:00:00Z",
          logoutReason: "ACCOUNT_LOCKED",
          logoutTime: "2026-05-06T03:00:00Z",
          role: "admin",
          status: "ended",
          username: "locked.user",
        },
        {
          browser: "Edge",
          ipAddress: "10.43.x.x",
          lastActivityTime: "2026-05-06T04:30:00Z",
          loginTime: "2026-05-06T04:00:00Z",
          logoutReason: "FORCED_LOGOUT",
          logoutTime: "2026-05-06T05:00:00Z",
          role: "user",
          status: "ended",
          username: "forced.user",
        },
      ],
      summary: {
        activeSessions: 8,
        bannedUsers: 1,
        loginsToday: 12,
        loginFailures24h: 15,
        totalDataRows: 100,
        totalImports: 4,
        totalUsers: 10,
      },
      trends: [
        { date: "2026-05-04", logins: 3, logouts: 1 },
        { date: "2026-05-05", logins: 3, logouts: 1 },
        { date: "2026-05-06", logins: 3, logouts: 2 },
      ],
    }),
  );

  assert.match(markup, /Action Queue/);
  assert.match(markup, /4 review items/);
  assert.match(markup, /Review failed login pressure/);
  assert.match(markup, /Check restricted account events/);
  assert.match(markup, /Verify forced session end/);
  assert.match(markup, /Inspect active session load/);
  assert.match(markup, /href="\/monitor\?section=activity"/);
  assert.match(markup, /href="\/monitor\?section=audit"/);
  assert.match(markup, /aria-label="Dashboard suggested action queue"/);
  assert.match(source, /buildDashboardActionQueueItems/);
  assert.match(source, /data-testid="card-dashboard-action-queue"/);
  assert.doesNotMatch(source, /useEffect\(/);
  assert.doesNotMatch(source, /setTimeout\(/);
});

test("DashboardActionQueue renders a clear state when no review item is needed", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardActionQueue, {
      loading: false,
      recentLoginActivities: [],
      summary: {
        activeSessions: 0,
        bannedUsers: 0,
        loginsToday: 2,
        loginFailures24h: 0,
        totalDataRows: 100,
        totalImports: 4,
        totalUsers: 10,
      },
      trends: [
        { date: "2026-05-04", logins: 2, logouts: 1 },
        { date: "2026-05-05", logins: 2, logouts: 1 },
        { date: "2026-05-06", logins: 2, logouts: 1 },
      ],
    }),
  );

  assert.match(markup, /Clear/);
  assert.match(markup, /No immediate review items/);
  assert.doesNotMatch(markup, /Open activity logs/);
});

test("DashboardSessionHealthStrip renders session freshness without lifecycle effects", () => {
  const source = readFileSync(path.resolve(__dirname, "../DashboardSessionHealthStrip.tsx"), "utf8");
  const markup = renderToStaticMarkup(
    createElement(DashboardSessionHealthStrip, {
      loading: false,
      recentLoginActivities: [
        {
          browser: "Chrome",
          ipAddress: "10.42.x.x",
          lastActivityTime: new Date().toISOString(),
          loginTime: "2026-05-06T06:00:00Z",
          logoutReason: null,
          logoutTime: null,
          role: "admin",
          status: "active",
          username: "fresh.user",
        },
        {
          browser: "Edge",
          ipAddress: "10.43.x.x",
          lastActivityTime: null,
          loginTime: "2026-05-06T05:40:00Z",
          logoutReason: null,
          logoutTime: null,
          role: "user",
          status: "active",
          username: "stale.user",
        },
        {
          browser: "Chrome",
          ipAddress: "10.44.x.x",
          lastActivityTime: "2026-05-06T04:45:00Z",
          loginTime: "2026-05-06T04:00:00Z",
          logoutReason: "IDLE_TIMEOUT",
          logoutTime: "2026-05-06T05:00:00Z",
          role: "user",
          status: "ended",
          username: "timeout.user",
        },
      ],
    }),
  );

  assert.match(markup, /Session Health/);
  assert.match(markup, /Needs review/);
  assert.match(markup, /Active now/);
  assert.match(markup, /Fresh/);
  assert.match(markup, /Idle watch/);
  assert.match(markup, /Stale/);
  assert.match(markup, /Ended by timeout/);
  assert.match(markup, /aria-label="Dashboard session health summary"/);
  assert.match(source, /buildDashboardSessionHealthItems/);
  assert.match(source, /data-testid="card-dashboard-session-health"/);
  assert.doesNotMatch(source, /useEffect\(/);
  assert.doesNotMatch(source, /setTimeout\(/);
  assert.doesNotMatch(source, /setInterval\(/);
});

test("DashboardLoginPatternSummary renders compact login pattern facts without lifecycle effects", () => {
  const source = readFileSync(path.resolve(__dirname, "../DashboardLoginPatternSummary.tsx"), "utf8");
  const markup = renderToStaticMarkup(
    createElement(DashboardLoginPatternSummary, {
      loading: false,
      peakHours: [
        { hour: 8, count: 2 },
        { hour: 9, count: 12 },
      ],
      recentLoginActivities: [
        {
          browser: "Chrome",
          ipAddress: "10.42.x.x",
          lastActivityTime: "2026-05-06T06:50:00Z",
          loginTime: "2026-05-06T06:00:00Z",
          logoutReason: null,
          logoutTime: null,
          role: "admin",
          status: "active",
          username: "active.user",
        },
        {
          browser: "Chrome",
          ipAddress: "10.43.x.x",
          lastActivityTime: "2026-05-06T05:45:00Z",
          loginTime: "2026-05-06T05:00:00Z",
          logoutReason: "IDLE_TIMEOUT",
          logoutTime: "2026-05-06T06:00:00Z",
          role: "user",
          status: "ended",
          username: "timeout.user",
        },
      ],
      summary: {
        activeSessions: 4,
        bannedUsers: 0,
        loginsToday: 15,
        loginFailures24h: 3,
        totalDataRows: 100,
        totalImports: 4,
        totalUsers: 10,
      },
      topUsers: [
        { lastLogin: "2026-05-06T03:00:00Z", loginCount: 8, role: "admin", username: "alpha" },
      ],
    }),
  );

  assert.match(markup, /Login Pattern Summary/);
  assert.match(markup, /Watch/);
  assert.match(markup, /Most active account/);
  assert.match(markup, /alpha/);
  assert.match(markup, /Common browser/);
  assert.match(markup, /Chrome/);
  assert.match(markup, /Peak login window/);
  assert.match(markup, /9 AM/);
  assert.match(markup, /Attention reason/);
  assert.match(markup, /Idle Timeout/);
  assert.match(markup, /aria-label="Dashboard login pattern facts"/);
  assert.match(source, /buildDashboardLoginPatternSummary/);
  assert.match(source, /data-testid="card-dashboard-login-pattern-summary"/);
  assert.doesNotMatch(source, /useEffect\(/);
  assert.doesNotMatch(source, /setTimeout\(/);
  assert.doesNotMatch(source, /setInterval\(/);
});

test("DashboardLoginRiskInsights renders operator-ready status from existing login signals", () => {
  const source = readFileSync(path.resolve(__dirname, "../DashboardLoginRiskInsights.tsx"), "utf8");
  const markup = renderToStaticMarkup(
    createElement(DashboardLoginRiskInsights, {
      loading: false,
      recentLoginActivities: [
        {
          browser: "Chrome",
          ipAddress: "10.42.x.x",
          lastActivityTime: "2026-05-06T02:30:00Z",
          loginTime: "2026-05-06T02:00:00Z",
          logoutReason: null,
          logoutTime: null,
          role: "superuser",
          status: "active",
          username: "super.user",
        },
      ],
      summary: {
        activeSessions: 9,
        bannedUsers: 0,
        loginsToday: 10,
        loginFailures24h: 12,
        totalDataRows: 100,
        totalImports: 4,
        totalUsers: 10,
      },
      trends: [
        { date: "2026-05-04", logins: 2, logouts: 1 },
        { date: "2026-05-05", logins: 3, logouts: 1 },
        { date: "2026-05-06", logins: 10, logouts: 2 },
      ],
    }),
  );

  assert.match(markup, /Login Risk Insights/);
  assert.match(markup, /Login risk status Attention/);
  assert.match(markup, /Failed login pressure/);
  assert.match(markup, /Active session load/);
  assert.match(markup, /Login trend check/);
  assert.match(markup, /Recent session state/);
  assert.match(markup, /Gunakan panel ini bersama rekod login terbaru/);
  assert.match(source, /className="grid gap-2 sm:grid-cols-2"/);
  assert.match(source, /text-xl font-bold/);
});

test("DashboardLoginRiskInsights keeps warning status contrast above axe thresholds", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardLoginRiskInsights, {
      loading: false,
      recentLoginActivities: [],
      summary: {
        activeSessions: 2,
        bannedUsers: 0,
        loginsToday: 4,
        loginFailures24h: 2,
        totalDataRows: 100,
        totalImports: 4,
        totalUsers: 10,
      },
      trends: [
        { date: "2026-05-04", logins: 2, logouts: 1 },
        { date: "2026-05-05", logins: 3, logouts: 1 },
        { date: "2026-05-06", logins: 4, logouts: 1 },
      ],
    }),
  );

  assert.match(markup, /Login risk status Watch/);
  assert.match(markup, /text-amber-800/);
  assert.match(markup, /dark:text-amber-200/);
  assert.doesNotMatch(markup, /text-amber-700/);
});

test("DashboardRecentLoginActivity renders masked access rows with retryable error state", () => {
  const source = readFileSync(path.resolve(__dirname, "../DashboardRecentLoginActivity.tsx"), "utf8");
  const markup = renderToStaticMarkup(
    createElement(DashboardRecentLoginActivity, {
      activities: [
        {
          browser: "Chrome",
          ipAddress: "10.42.x.x",
          lastActivityTime: "2026-05-06T02:30:00Z",
          loginTime: "2026-05-06T02:00:00Z",
          logoutReason: null,
          logoutTime: null,
          role: "superuser",
          status: "active",
          username: "super.user",
        },
        {
          browser: "Edge",
          ipAddress: "10.43.x.x",
          lastActivityTime: "2026-05-06T04:30:00Z",
          loginTime: "2026-05-06T04:00:00Z",
          logoutReason: "IDLE_TIMEOUT",
          logoutTime: "2026-05-06T05:00:00Z",
          role: "admin",
          status: "ended",
          username: "watch.user",
        },
      ],
      errorMessage: null,
      loading: false,
      onRetry: () => undefined,
      retrying: false,
    }),
  );

  assert.match(markup, /Recent Login Activity/);
  assert.match(markup, /Latest access events with masked network details/);
  assert.match(markup, /super\.user/);
  assert.match(markup, /watch\.user/);
  assert.match(markup, /10\.42\.x\.x/);
  assert.match(markup, /Chrome/);
  assert.match(markup, /Filter recent login activity/);
  assert.match(markup, /button-login-activity-filter-all/);
  assert.match(markup, /Show attention login activity, 1 records/);
  assert.match(markup, /aria-label="All recent login activity list"/);
  assert.match(markup, /Open login activity details for super\.user/);
  assert.match(markup, /Details/);
  assert.match(markup, /tabindex="0"/);
  assert.match(source, /max-h-\[360px\]/);
  assert.match(source, /xl:grid-cols-1 2xl:grid-cols-2/);
  assert.match(source, /useMemo\(/);
  assert.match(source, /DashboardRecentLoginActivityDetailSheet/);
  assert.match(source, /SheetContent/);
  assert.match(source, /resolveDashboardRecentLoginRiskNote/);
  assert.match(source, /setSelectedActivity\(null\)/);
  assert.doesNotMatch(source, /useEffect\(/);
  assert.doesNotMatch(source, /setTimeout\(/);

  const errorMarkup = renderToStaticMarkup(
    createElement(DashboardRecentLoginActivity, {
      activities: [],
      errorMessage: "Recent login API gagal.",
      loading: false,
      onRetry: () => undefined,
      retrying: false,
    }),
  );

  assert.match(errorMarkup, /Aktiviti login gagal dimuat/);
  assert.match(errorMarkup, /Recent login API gagal\./);
  assert.match(errorMarkup, /Cuba lagi/);
  assert.doesNotMatch(errorMarkup, /No recent login activity is available yet/);
});

test("Dashboard manual refresh tolerates partial query failures", () => {
  const dashboardSource = readFileSync(path.resolve(__dirname, "../../Dashboard.tsx"), "utf8");

  assert.match(dashboardSource, /Promise\.allSettled\(/);
  assert.match(dashboardSource, /getRejectedDashboardRefreshResults/);
  assert.match(dashboardSource, /Dashboard refresh query failed:/);
  assert.doesNotMatch(dashboardSource, /await Promise\.all\(\[[\s\S]*refetchSummary\(\)/);
});

test("DashboardChartsGrid memoizes heavy chart rendering helpers", () => {
  const source = readFileSync(path.resolve(__dirname, "../DashboardChartsGrid.tsx"), "utf8");
  const partsSource = readFileSync(path.resolve(__dirname, "../DashboardChartsGridParts.tsx"), "utf8");

  assert.match(partsSource, /const CompactChartTooltip = memo\(function CompactChartTooltip/);
  assert.match(source, /const loginTrendTickDates = useMemo\(/);
  assert.match(source, /const renderLoginTrendTooltip = useCallback\(/);
  assert.match(source, /const renderPeakHoursTooltip = useCallback\(/);
  assert.match(source, /export const DashboardChartsGrid = memo\(DashboardChartsGridImpl\)/);
});

test("DashboardChartsGrid renders independent retryable error states", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardChartsGrid, {
      onTrendDaysChange: () => undefined,
      onRetryPeakHours: () => undefined,
      onRetryTrends: () => undefined,
      peakHoursErrorMessage: "Waktu puncak timeout.",
      peakHours: [],
      peakHoursLoading: false,
      peakHoursRetrying: false,
      trendDays: 7,
      trendsErrorMessage: "Trend login timeout.",
      trends: [],
      trendsLoading: false,
      trendsRetrying: false,
    }),
  );

  assert.match(markup, /Trend login gagal dimuat/);
  assert.match(markup, /Trend login timeout\./);
  assert.match(markup, /Waktu puncak gagal dimuat/);
  assert.match(markup, /Waktu puncak timeout\./);
  assert.match(markup, /Cuba lagi/);
  assert.doesNotMatch(markup, /No data available/);
});

test("DashboardUserInsightsGrid keeps chart semantics grouped and the top-users scroller keyboard reachable", () => {
  const source = readFileSync(path.resolve(__dirname, "../DashboardUserInsightsGrid.tsx"), "utf8");
  const markup = renderToStaticMarkup(
    createElement(DashboardUserInsightsGrid, {
      onRetryRoleDistribution: () => undefined,
      onRetryTopUsers: () => undefined,
      roleErrorMessage: null,
      roleDistribution: [
        { role: "admin", count: 2 },
        { role: "superuser", count: 3 },
        { role: "user", count: 5 },
      ],
      roleLoading: false,
      roleRetrying: false,
      topUsersErrorMessage: null,
      topUsers: [
        { username: "alpha", loginCount: 8, role: "admin", lastLogin: "2026-05-06T01:00:00Z" },
        { username: "beta", loginCount: 5, role: "user", lastLogin: "2026-05-06T02:00:00Z" },
      ],
      topUsersLoading: false,
      topUsersRetrying: false,
    }),
  );

  assert.match(markup, /aria-label="Top active users list"/);
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /role="img"/);
  assert.match(markup, /aria-label="User role distribution chart"/);
  assert.match(source, /accessibilityLayer=\{false\}/);
  assert.match(source, /tabIndex=\{-1\}/);
  assert.match(source, /role="presentation"/);
  assert.match(source, /const container = roleChartSurfaceRef\.current/);
  assert.match(source, /sanitizeDashboardRoleDistributionChartSurface\(container\)/);
  assert.match(source, /ref=\{roleChartSurfaceRef\}/);
  assert.match(source, /new MutationObserver\(scheduleChartSurfaceSanitization\)/);
  assert.match(source, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(source, /window\.cancelAnimationFrame\(sanitizeFrameId\)/);
  assert.match(source, /window\.cancelAnimationFrame\(followUpFrameId\)/);
  assert.doesNotMatch(source, /window\.setTimeout\(sanitizeChartSurface,\s*0\)/);
  assert.match(source, /observer\?\.disconnect\(\)/);
});

test("DashboardUserInsightsGrid renders per-card retryable error states", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardUserInsightsGrid, {
      onRetryRoleDistribution: () => undefined,
      onRetryTopUsers: () => undefined,
      roleErrorMessage: "Role API gagal.",
      roleDistribution: [],
      roleLoading: false,
      roleRetrying: false,
      topUsersErrorMessage: "Top users API gagal.",
      topUsers: [],
      topUsersLoading: false,
      topUsersRetrying: false,
    }),
  );

  assert.match(markup, /Pengguna aktif gagal dimuat/);
  assert.match(markup, /Top users API gagal\./);
  assert.match(markup, /Taburan peranan gagal dimuat/);
  assert.match(markup, /Role API gagal\./);
  assert.match(markup, /Cuba lagi/);
  assert.doesNotMatch(markup, /No data available/);
});

test("sanitizeDashboardRoleDistributionChartSurface hides generated pie slices from assistive tech", () => {
  const createMockNode = (initialAttributes: Record<string, string> = {}) => {
    const attributes = new Map(Object.entries(initialAttributes));

    return {
      getAttribute(name: string) {
        return attributes.has(name) ? attributes.get(name) ?? null : null;
      },
      removeAttribute(name: string) {
        attributes.delete(name);
      },
      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      },
    };
  };

  const layer = createMockNode();
  const path = createMockNode({
    focusable: "true",
    name: "admin",
    role: "img",
  });
  const label = createMockNode({
    focusable: "true",
    name: "admin",
    role: "img",
  });
  const nodesBySelector = new Map<string, unknown[]>([
    ["g.recharts-pie-sector", [layer]],
    ["path.recharts-sector", [path]],
    ["text.recharts-text", [label]],
  ]);
  const container = {
    querySelectorAll(selector: string) {
      return nodesBySelector.get(selector) ?? [];
    },
  } as unknown as DashboardRoleChartSurface;

  sanitizeDashboardRoleDistributionChartSurface(container);

  assert.equal(layer.getAttribute("aria-hidden"), "true");
  assert.equal(layer.getAttribute("role"), "presentation");
  assert.equal(path.getAttribute("aria-hidden"), "true");
  assert.equal(path.getAttribute("role"), "presentation");
  assert.equal(path.getAttribute("focusable"), "false");
  assert.equal(path.getAttribute("name"), null);
  assert.equal(label.getAttribute("aria-hidden"), "true");
  assert.equal(label.getAttribute("role"), "presentation");
  assert.equal(label.getAttribute("focusable"), "false");
  assert.equal(label.getAttribute("name"), null);
});
