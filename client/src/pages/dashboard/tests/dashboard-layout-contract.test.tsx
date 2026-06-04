import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Activity, Database, FileText, LogIn, ShieldOff, Users, AlertTriangle } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { DashboardChartsGrid } from "@/pages/dashboard/DashboardChartsGrid";
import { DashboardPageHeader } from "@/pages/dashboard/DashboardPageHeader";
import { DashboardSectionRenderFallback } from "@/pages/dashboard/DashboardSectionRenderBoundary";
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
  { title: "Total Data Rows", value: 1200, icon: Database, color: "text-orange-600 dark:text-orange-400" },
  { title: "Total Imports", value: 25, icon: FileText, color: "text-teal-600 dark:text-teal-400" },
  { title: "Banned Users", value: 1, icon: ShieldOff, color: "text-red-600 dark:text-red-400" },
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
      trendDays: 14,
      exportingPdf: false,
      exportBlockReason: null,
      refreshing: false,
      onExportPdf: () => undefined,
      onRefresh: () => undefined,
    }),
  );

  assert.match(markup, /Dashboard Analytics/);
  assert.match(markup, /Trend 14d/);
  assert.match(markup, /7 KPI cards/);
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
      summaryCards: summaryCards.slice(0, 3),
      summaryErrorMessage: null,
      summaryLoading: false,
      summaryRetrying: false,
      onRetrySummary: () => undefined,
    }),
  );

  assert.match(markup, /Quick Snapshot/);
  assert.match(markup, /3 metrics/);
  assert.match(markup, /compact dashboard snapshot/);
});

test("DashboardSnapshotSection renders a retryable local error state", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardSnapshotSection, {
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
  assert.match(deferredSource, /sectionName="Carta dashboard"/);
  assert.match(deferredSource, /sectionName="Insight pengguna dashboard"/);
  assert.match(fallbackMarkup, /role="alert"/);
  assert.match(fallbackMarkup, /aria-live="assertive"/);
  assert.match(fallbackMarkup, /aria-label="Carta dashboard tidak dapat dimuatkan"/);
  assert.match(fallbackMarkup, /Carta dashboard tidak dapat dimuatkan\./);
  assert.match(fallbackMarkup, /Bahagian ini gagal dirender/);
  assert.match(fallbackMarkup, /Cuba lagi/);
  assert.match(fallbackMarkup, /type="button"/);
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
