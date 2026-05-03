import assert from "node:assert/strict";
import test from "node:test";
import { Activity, Database, FileText, LogIn, ShieldOff, Users, AlertTriangle } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardPageHeader } from "@/pages/dashboard/DashboardPageHeader";
import { DashboardSnapshotSection } from "@/pages/dashboard/DashboardSnapshotSection";
import { DashboardSummaryCards } from "@/pages/dashboard/DashboardSummaryCards";
import type { SummaryCardItem } from "@/pages/dashboard/types";

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
