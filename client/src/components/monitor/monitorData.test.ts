import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChartSeries,
  buildRollupFreshnessSummary,
  formatMonitorDurationCompact,
  getRollupFreshnessStatus,
} from "@/components/monitor/monitorData";
import { initialHistory } from "@/hooks/system-metrics-utils";

test("getRollupFreshnessStatus reports fresh when no rollup backlog is present", () => {
  assert.equal(
    getRollupFreshnessStatus({
      rollupRefreshPendingCount: 0,
      rollupRefreshRetryCount: 0,
      rollupRefreshOldestPendingAgeMs: 0,
    }),
    "fresh",
  );
});

test("getRollupFreshnessStatus reports warming for small active rollup backlog", () => {
  assert.equal(
    getRollupFreshnessStatus({
      rollupRefreshPendingCount: 3,
      rollupRefreshRetryCount: 0,
      rollupRefreshOldestPendingAgeMs: 20_000,
    }),
    "warming",
  );
});

test("getRollupFreshnessStatus reports stale when retries or lag breach the SLA", () => {
  assert.equal(
    getRollupFreshnessStatus({
      rollupRefreshPendingCount: 2,
      rollupRefreshRetryCount: 1,
      rollupRefreshOldestPendingAgeMs: 15_000,
    }),
    "stale",
  );

  assert.equal(
    getRollupFreshnessStatus({
      rollupRefreshPendingCount: 2,
      rollupRefreshRetryCount: 0,
      rollupRefreshOldestPendingAgeMs: 130_000,
    }),
    "stale",
  );
});

test("formatMonitorDurationCompact keeps freshness ages readable", () => {
  assert.equal(formatMonitorDurationCompact(950), "950ms");
  assert.equal(formatMonitorDurationCompact(12_300), "12s");
  assert.equal(formatMonitorDurationCompact(75_000), "1m 15s");
});

test("buildRollupFreshnessSummary explains warming and stale rollup states clearly", () => {
  assert.equal(
    buildRollupFreshnessSummary({
      rollupRefreshPendingCount: 0,
      rollupRefreshRunningCount: 0,
      rollupRefreshRetryCount: 0,
      rollupRefreshOldestPendingAgeMs: 0,
    }),
    "Fresh: collection report rollups are keeping up with current mutations.",
  );

  assert.equal(
    buildRollupFreshnessSummary({
      rollupRefreshPendingCount: 4,
      rollupRefreshRunningCount: 1,
      rollupRefreshRetryCount: 0,
      rollupRefreshOldestPendingAgeMs: 42_000,
    }),
    "Warming: 4 pending slice(s), 1 running, oldest 42s.",
  );

  assert.equal(
    buildRollupFreshnessSummary({
      rollupRefreshPendingCount: 8,
      rollupRefreshRunningCount: 1,
      rollupRefreshRetryCount: 2,
      rollupRefreshOldestPendingAgeMs: 125_000,
    }),
    "Stale: 8 pending slice(s), oldest 2m 5s. 2 slice(s) waiting to retry.",
  );
});

test("buildChartSeries keeps technical devops charts grouped into stable categories", () => {
  const charts = buildChartSeries(initialHistory);

  assert.deepEqual(
    charts.map((chart) => `${chart.category}:${chart.title}`),
    [
      "Infrastructure Capacity:CPU %",
      "Infrastructure Capacity:RAM %",
      "Runtime Experience:p95 Latency",
      "Runtime Experience:Error Rate",
      "Data And AI:DB Latency",
      "Data And AI:AI Latency",
    ],
  );
  assert.deepEqual(
    charts.map((chart) => chart.color),
    [
      "hsl(var(--chart-4))",
      "hsl(var(--chart-1))",
      "hsl(var(--muted-foreground))",
      "hsl(var(--destructive))",
      "hsl(var(--chart-2))",
      "hsl(var(--chart-3))",
    ],
  );
});
