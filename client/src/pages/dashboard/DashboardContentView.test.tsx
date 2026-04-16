import assert from "node:assert/strict";
import test from "node:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardContentView } from "@/pages/dashboard/DashboardContentView";
import type { SummaryData } from "@/pages/dashboard/types";
import { buildSummaryCards } from "@/pages/dashboard/utils";

function createBaseProps() {
  const summary: SummaryData = {
    totalUsers: 5,
    activeSessions: 3,
    loginsToday: 1,
    totalDataRows: 42,
    totalImports: 2,
    bannedUsers: 0,
    collectionRecordVersionConflicts24h: 0,
  };

  return {
    dashboardRef: createRef<HTMLDivElement>(),
    deferSecondary: false,
    exportBlockReason: null,
    exportingPdf: false,
    initialLoading: false,
    isMobile: false,
    onExportPdf: () => undefined,
    onRefresh: () => undefined,
    onRetryPeakHours: () => undefined,
    onRetryRoleDistribution: () => undefined,
    onRetryTopUsers: () => undefined,
    onRetryTrends: () => undefined,
    pageErrorMessage: null,
    peakHours: [{ hour: 9, count: 12 }],
    peakHoursErrorMessage: null,
    peakHoursLoading: false,
    refreshing: false,
    roleDistribution: [{ role: "admin", count: 2 }],
    roleErrorMessage: null,
    roleLoading: false,
    summaryCards: buildSummaryCards(summary),
    summaryLoading: false,
    topUsers: [{ username: "admin.user", loginCount: 7, role: "admin", lastLogin: "2026-04-16T00:00:00.000Z" }],
    topUsersErrorMessage: null,
    topUsersLoading: false,
    trendDays: 7,
    trends: [{ date: "2026-04-16", logins: 4, logouts: 2 }],
    trendsErrorMessage: null,
    trendsLoading: false,
    onTrendDaysChange: () => undefined,
  };
}

test("DashboardContentView renders a first-load shell without a blank dashboard", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardContentView, {
      ...createBaseProps(),
      initialLoading: true,
      summaryLoading: true,
      trendsLoading: true,
      peakHoursLoading: true,
      roleLoading: true,
      topUsersLoading: true,
      peakHours: undefined,
      roleDistribution: undefined,
      topUsers: undefined,
      trends: undefined,
    }),
  );

  assert.match(markup, /Loading dashboard charts/i);
  assert.match(markup, /Quick Snapshot/i);
});

test("DashboardContentView renders a page-level fallback when the primary snapshot fails", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardContentView, {
      ...createBaseProps(),
      pageErrorMessage: "The quick snapshot is unavailable right now.",
    }),
  );

  assert.match(markup, /Dashboard data could not be loaded/i);
  assert.match(markup, /The quick snapshot is unavailable right now\./i);
});

test("DashboardContentView renders the normal dashboard body when data is available", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardContentView, createBaseProps()),
  );

  assert.match(markup, /Dashboard Analytics/i);
  assert.match(markup, /Quick Snapshot/i);
});
