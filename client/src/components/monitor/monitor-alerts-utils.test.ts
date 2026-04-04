import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonitorAlertsCompactSummary,
  buildMonitorAlertsSummaryFacts,
} from "@/components/monitor/monitor-alerts-utils";
import type { MonitorAlert, MonitorPagination } from "@/lib/api";

function createPagination(totalItems: number): MonitorPagination {
  return {
    page: 1,
    pageSize: 5,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / 5)),
  };
}

function createAlert(severity: MonitorAlert["severity"]): MonitorAlert {
  return {
    id: `${severity.toLowerCase()}-1`,
    severity,
    message: `${severity} alert`,
    timestamp: "2026-04-04T12:00:00.000Z",
    source: "system",
  };
}

test("buildMonitorAlertsCompactSummary reports a clear state when no live or historical incidents exist", () => {
  const result = buildMonitorAlertsCompactSummary({
    alerts: [],
    alertsPagination: createPagination(0),
    alertHistoryPagination: createPagination(0),
  });

  assert.deepEqual(result, {
    tone: "stable",
    badge: "Clear",
    headline: "No live incidents are open right now.",
    description: "Alert panels stay collapsed until operators need fresh incidents or older history.",
  });
});

test("buildMonitorAlertsCompactSummary highlights critical incidents visible on the current page", () => {
  const result = buildMonitorAlertsCompactSummary({
    alerts: [createAlert("CRITICAL"), createAlert("WARNING")],
    alertsPagination: createPagination(8),
    alertHistoryPagination: createPagination(12),
  });

  assert.deepEqual(result, {
    tone: "attention",
    badge: "Attention",
    headline: "Live incidents need operator review.",
    description: "8 live incidents are open, with 1 critical item visible on this page.",
  });
});

test("buildMonitorAlertsSummaryFacts keeps live, history, and visible severity badges compact", () => {
  const result = buildMonitorAlertsSummaryFacts({
    alerts: [createAlert("CRITICAL"), createAlert("WARNING")],
    alertsPagination: createPagination(8),
    alertHistoryPagination: createPagination(12),
  });

  assert.deepEqual(result, [
    {
      label: "Live",
      value: "8",
      tone: "watch",
    },
    {
      label: "History",
      value: "12",
      tone: "stable",
    },
    {
      label: "Critical visible",
      value: "1",
      tone: "attention",
    },
  ]);
});
