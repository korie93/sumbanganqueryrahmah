import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Activity, Database, FileText, LogIn, ShieldOff, Users, AlertTriangle } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { DashboardPageHeader } from "@/pages/dashboard/DashboardPageHeader";
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
  { title: "Total Users", value: 10, icon: Users, color: "text-blue-600 dark:text-blue-400" },
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
      summaryLoading: false,
    }),
  );

  assert.match(markup, /Quick Snapshot/);
  assert.match(markup, /3 metrics/);
  assert.match(markup, /compact dashboard snapshot/);
});

test("DashboardChartsGrid memoizes heavy chart rendering helpers", () => {
  const source = readFileSync(path.resolve(__dirname, "../DashboardChartsGrid.tsx"), "utf8");

  assert.match(source, /const CompactChartTooltip = memo\(function CompactChartTooltip/);
  assert.match(source, /const loginTrendTickDates = useMemo\(/);
  assert.match(source, /const renderLoginTrendTooltip = useCallback\(/);
  assert.match(source, /const renderPeakHoursTooltip = useCallback\(/);
  assert.match(source, /export const DashboardChartsGrid = memo\(DashboardChartsGridImpl\)/);
});

test("DashboardUserInsightsGrid keeps chart semantics grouped and the top-users scroller keyboard reachable", () => {
  const source = readFileSync(path.resolve(__dirname, "../DashboardUserInsightsGrid.tsx"), "utf8");
  const markup = renderToStaticMarkup(
    createElement(DashboardUserInsightsGrid, {
      roleDistribution: [
        { role: "admin", count: 2 },
        { role: "superuser", count: 3 },
        { role: "user", count: 5 },
      ],
      roleLoading: false,
      topUsers: [
        { username: "alpha", loginCount: 8, role: "admin", lastLogin: "2026-05-06T01:00:00Z" },
        { username: "beta", loginCount: 5, role: "user", lastLogin: "2026-05-06T02:00:00Z" },
      ],
      topUsersLoading: false,
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
  assert.match(source, /new MutationObserver\(sanitizeChartSurface\)/);
  assert.match(source, /observer\?\.disconnect\(\)/);
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
