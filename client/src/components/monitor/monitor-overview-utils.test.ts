import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonitorOverviewCompactSummary,
  buildMonitorOverviewCompactItems,
  isMonitorOverviewStable,
  resolveInitialMonitorOverviewExpanded,
} from "@/components/monitor/monitor-overview-utils";
import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";

const snapshot: MonitorSnapshot = {
  mode: "NORMAL",
  score: 91.4,
  bottleneckType: "database",
  workerCount: 4,
  maxWorkers: 8,
  activeAlertCount: 3,
  cpuPercent: 42,
  ramPercent: 61,
  eventLoopLagMs: 13,
  requestsPerSec: 48,
  p95LatencyMs: 380,
  errorRate: 0.3,
  activeRequests: 8,
  avgQueryTimeMs: 44,
  slowQueryCount: 2,
  connections: 16,
  aiLatencyMs: 220,
  queueSize: 4,
  rollupRefreshPendingCount: 7,
  rollupRefreshRunningCount: 2,
  rollupRefreshRetryCount: 1,
  rollupRefreshOldestPendingAgeMs: 180000,
  aiFailRate: 0.1,
  status401Count: 0,
  status403Count: 0,
  status429Count: 1,
  openCircuitCount: 0,
};

test("resolveInitialMonitorOverviewExpanded keeps mobile compact by default", () => {
  assert.equal(resolveInitialMonitorOverviewExpanded(375), false);
  assert.equal(resolveInitialMonitorOverviewExpanded(1280), true);
  assert.equal(resolveInitialMonitorOverviewExpanded(undefined), true);
});

test("buildMonitorOverviewCompactItems keeps overview chips stable and readable", () => {
  assert.deepEqual(buildMonitorOverviewCompactItems(snapshot, "3m"), [
    { label: "Mode", value: "NORMAL" },
    { label: "Bottleneck", value: "database" },
    { label: "Workers", value: "4/8" },
    { label: "Queue", value: "7 pending" },
    { label: "Alerts", value: "3" },
    { label: "Oldest", value: "3m" },
  ]);
});

test("isMonitorOverviewStable detects calm monitor states conservatively", () => {
  assert.equal(
    isMonitorOverviewStable({
      ...snapshot,
      mode: "NORMAL",
      score: 96,
      activeAlertCount: 0,
      rollupRefreshPendingCount: 0,
      rollupRefreshRetryCount: 0,
    }),
    true,
  );
  assert.equal(
    isMonitorOverviewStable({
      ...snapshot,
      score: 84,
    }),
    false,
  );
});

test("buildMonitorOverviewCompactSummary keeps stable and attention copy predictable", () => {
  assert.deepEqual(
    buildMonitorOverviewCompactSummary(
      {
        ...snapshot,
        mode: "NORMAL",
        score: 94,
        activeAlertCount: 0,
        rollupRefreshPendingCount: 0,
        rollupRefreshRetryCount: 0,
      },
      "18s",
    ),
    {
      tone: "stable",
      badge: "Stable",
      headline: "All core signals are within current thresholds.",
      description: "Workers are steady, alerts are clear, and the oldest rollup age is 18s.",
    },
  );

  assert.deepEqual(
    buildMonitorOverviewCompactSummary(
      {
        ...snapshot,
        mode: "PROTECTION",
        activeAlertCount: 2,
      },
      "4m",
    ),
    {
      tone: "attention",
      badge: "Attention",
      headline: "Operator review is recommended before expanding the full grid.",
      description: "2 live alerts and PROTECTION mode may need a closer look.",
    },
  );
});
