import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonitorMetricsCompactSummary,
  buildMonitorMetricsSummaryFacts,
} from "@/components/monitor/monitor-metrics-summary-utils";
import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";

function createSnapshot(overrides: Partial<MonitorSnapshot> = {}): MonitorSnapshot {
  return {
    mode: "NORMAL",
    score: 94,
    bottleneckType: "database",
    workerCount: 4,
    maxWorkers: 8,
    activeAlertCount: 0,
    cpuPercent: 42,
    ramPercent: 61,
    eventLoopLagMs: 12,
    requestsPerSec: 48,
    p95LatencyMs: 310,
    errorRate: 0.2,
    activeRequests: 8,
    avgQueryTimeMs: 44,
    slowQueryCount: 0,
    connections: 16,
    aiLatencyMs: 220,
    queueSize: 4,
    rollupRefreshPendingCount: 0,
    rollupRefreshRunningCount: 0,
    rollupRefreshRetryCount: 0,
    rollupRefreshOldestPendingAgeMs: 0,
    aiFailRate: 0.1,
    status401Count: 0,
    status403Count: 0,
    status429Count: 0,
    openCircuitCount: 0,
    ...overrides,
  };
}

test("buildMonitorMetricsCompactSummary reports healthy KPI layers when snapshot is calm", () => {
  assert.deepEqual(buildMonitorMetricsCompactSummary(createSnapshot()), {
    tone: "stable",
    badge: "Healthy",
    headline: "Core KPI layers are staying within current thresholds.",
    description: "Infrastructure, application, database, and AI groups remain healthy until deeper detail is requested.",
  });
});

test("buildMonitorMetricsCompactSummary escalates when multiple layers are under pressure", () => {
  assert.deepEqual(
    buildMonitorMetricsCompactSummary(
      createSnapshot({
        cpuPercent: 91,
        p95LatencyMs: 980,
        aiLatencyMs: 740,
      }),
    ),
    {
      tone: "attention",
      badge: "Attention",
      headline: "One or more KPI layers need closer operator review.",
      description: "2 layers are in attention and 1 remain on watch before you open the grouped panels.",
    },
  );
});

test("buildMonitorMetricsSummaryFacts exposes layer health in a compact form", () => {
  assert.deepEqual(
    buildMonitorMetricsSummaryFacts(
      createSnapshot({
        cpuPercent: 74,
        avgQueryTimeMs: 340,
      }),
    ),
    [
      { label: "Infra", value: "Watch", tone: "watch" },
      { label: "App", value: "Healthy", tone: "stable" },
      { label: "DB", value: "Watch", tone: "watch" },
      { label: "AI", value: "Healthy", tone: "stable" },
    ],
  );
});
