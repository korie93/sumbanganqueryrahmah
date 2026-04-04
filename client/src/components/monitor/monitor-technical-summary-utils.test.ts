import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonitorTechnicalCompactSummary,
  buildMonitorTechnicalSummaryFacts,
} from "@/components/monitor/monitor-technical-summary-utils";
import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";

function createSnapshot(overrides: Partial<MonitorSnapshot> = {}): MonitorSnapshot {
  return {
    mode: "NORMAL",
    score: 95,
    bottleneckType: "Stable",
    workerCount: 4,
    maxWorkers: 6,
    activeAlertCount: 0,
    cpuPercent: 42,
    ramPercent: 55,
    eventLoopLagMs: 18,
    requestsPerSec: 28,
    p95LatencyMs: 310,
    errorRate: 0.4,
    activeRequests: 8,
    avgQueryTimeMs: 180,
    slowQueryCount: 0,
    connections: 5,
    aiLatencyMs: 420,
    queueSize: 1,
    rollupRefreshPendingCount: 0,
    rollupRefreshRunningCount: 0,
    rollupRefreshRetryCount: 0,
    rollupRefreshOldestPendingAgeMs: 0,
    aiFailRate: 0.2,
    status401Count: 0,
    status403Count: 0,
    status429Count: 0,
    openCircuitCount: 0,
    ...overrides,
  };
}

test("buildMonitorTechnicalCompactSummary keeps healthy and attention copy stable", () => {
  assert.deepEqual(buildMonitorTechnicalCompactSummary(createSnapshot()), {
    tone: "stable",
    badge: "Healthy",
    headline: "Runtime, database, and AI signals are within current technical thresholds.",
    description: "Detailed chart groups remain collapsed by default so operators only load deeper diagnostics when they need them.",
  });

  assert.deepEqual(
    buildMonitorTechnicalCompactSummary(
      createSnapshot({
        cpuPercent: 91,
        p95LatencyMs: 960,
      }),
    ),
    {
      tone: "attention",
      badge: "Attention",
      headline: "CPU trends deserve closer technical diagnosis.",
      description: "2 core runtime signals crossed the current attention threshold. Open detailed charts only when you need deeper time-series context.",
    },
  );
});

test("buildMonitorTechnicalSummaryFacts reports compact signal facts with tone", () => {
  assert.deepEqual(
    buildMonitorTechnicalSummaryFacts(
      createSnapshot({
        cpuPercent: 72,
        p95LatencyMs: 960,
      }),
    ),
    [
      {
        label: "CPU",
        value: "72%",
        tone: "watch",
      },
      {
        label: "p95",
        value: "960ms",
        tone: "attention",
      },
      {
        label: "DB",
        value: "180ms",
        tone: "stable",
      },
      {
        label: "AI",
        value: "420ms",
        tone: "stable",
      },
    ],
  );
});
