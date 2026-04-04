import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonitorShellDescription,
  buildMonitorShellFacts,
} from "@/components/monitor/monitor-shell-utils";
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

test("buildMonitorShellDescription keeps monitor header copy predictable", () => {
  assert.equal(
    buildMonitorShellDescription({
      hasNetworkFailure: true,
      isLoading: false,
      updatedLabel: "11:45:00",
    }),
    "Runtime, alert, and rollup signals are still visible, but some cards may be showing the latest cached snapshot while connectivity recovers.",
  );

  assert.equal(
    buildMonitorShellDescription({
      hasNetworkFailure: false,
      isLoading: true,
      updatedLabel: "-",
    }),
    "Loading runtime, alert, and rollup signals for operators and admins.",
  );
});

test("buildMonitorShellFacts summarizes monitor mode, score, rollup, and update state", () => {
  assert.deepEqual(
    buildMonitorShellFacts({
      snapshot,
      rollupFreshnessStatus: "warming",
      updatedLabel: "11:45:00",
    }),
    [
      { label: "Mode", value: "NORMAL", tone: "stable" },
      { label: "Score", value: "91", tone: "stable" },
      { label: "Rollup", value: "Warming", tone: "watch" },
      { label: "Updated", value: "11:45:00", tone: "stable" },
    ],
  );
});
