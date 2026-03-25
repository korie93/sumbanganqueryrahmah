import assert from "node:assert/strict";
import test from "node:test";
import { buildInternalMonitorAlerts } from "../../internal/runtime-monitor-alerts";
import type { InternalMonitorSnapshot } from "../../internal/runtime-monitor-types";

function createSnapshot(overrides: Partial<InternalMonitorSnapshot> = {}): InternalMonitorSnapshot {
  return {
    score: 100,
    mode: "NORMAL",
    cpuPercent: 10,
    ramPercent: 20,
    p95LatencyMs: 25,
    errorRate: 0,
    dbLatencyMs: 10,
    aiLatencyMs: 0,
    eventLoopLagMs: 4,
    requestRate: 1,
    activeRequests: 0,
    queueLength: 0,
    workerCount: 1,
    maxWorkers: 2,
    dbProtection: false,
    slowQueryCount: 0,
    dbConnections: 2,
    aiFailRate: 0,
    status401Count: 0,
    status403Count: 0,
    status429Count: 0,
    localOpenCircuitCount: 0,
    clusterOpenCircuitCount: 0,
    bottleneckType: "NONE",
    rollupRefreshPendingCount: 0,
    rollupRefreshRunningCount: 0,
    rollupRefreshRetryCount: 0,
    rollupRefreshOldestPendingAgeMs: 0,
    updatedAt: Date.parse("2026-03-25T00:00:00.000Z"),
    ...overrides,
  };
}

test("buildInternalMonitorAlerts emits rollup queue backlog, lag, and retry alerts", () => {
  const alerts = buildInternalMonitorAlerts(createSnapshot({
    rollupRefreshPendingCount: 14,
    rollupRefreshRetryCount: 2,
    rollupRefreshOldestPendingAgeMs: 75_000,
  }));

  assert.equal(alerts.some((alert) => alert.source === "ROLLUP_QUEUE"), true);
  assert.equal(alerts.some((alert) => alert.source === "ROLLUP_LAG"), true);
  assert.equal(alerts.some((alert) => alert.source === "ROLLUP_RETRY"), true);
});

test("buildInternalMonitorAlerts escalates rollup alerts to critical when thresholds are severe", () => {
  const alerts = buildInternalMonitorAlerts(createSnapshot({
    rollupRefreshPendingCount: 32,
    rollupRefreshRetryCount: 5,
    rollupRefreshOldestPendingAgeMs: 8 * 60 * 1000,
  }));

  assert.equal(
    alerts.some((alert) => alert.source === "ROLLUP_QUEUE" && alert.severity === "CRITICAL"),
    true,
  );
  assert.equal(
    alerts.some((alert) => alert.source === "ROLLUP_LAG" && alert.severity === "CRITICAL"),
    true,
  );
  assert.equal(
    alerts.some((alert) => alert.source === "ROLLUP_RETRY" && alert.severity === "CRITICAL"),
    true,
  );
});
