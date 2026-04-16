import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardChartsGrid } from "@/pages/dashboard/DashboardChartsGrid";

test("DashboardChartsGrid renders an accessible summary for chart data", () => {
  const markup = renderToStaticMarkup(
    createElement(DashboardChartsGrid, {
      onTrendDaysChange: () => undefined,
      peakHours: [
        { hour: 9, count: 12 },
        { hour: 10, count: 8 },
      ],
      peakHoursLoading: false,
      trendDays: 7,
      trends: [
        { date: "2026-04-10", logins: 5, logouts: 4 },
        { date: "2026-04-11", logins: 9, logouts: 7 },
      ],
      trendsLoading: false,
    }),
  );

  assert.match(markup, /Login Trends summary/i);
  assert.match(markup, /Peak Activity Hours summary/i);
  assert.match(markup, /Highest login day/i);
});
