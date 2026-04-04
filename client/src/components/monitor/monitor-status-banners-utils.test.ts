import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonitorStatusHeadline,
  buildMonitorStatusNotices,
  buildMonitorStatusSummaryFacts,
  buildMonitorStatusSummaryText,
  resolveInitialMonitorStatusDetailsOpen,
} from "@/components/monitor/monitor-status-banners-utils";

test("buildMonitorStatusNotices returns an empty list when monitor is healthy", () => {
  assert.deepEqual(
    buildMonitorStatusNotices({
      mode: "NORMAL",
      hasNetworkFailure: false,
      rollupFreshnessStatus: "fresh",
      rollupFreshnessSummary: "fresh",
    }),
    [],
  );
});

test("buildMonitorStatusNotices keeps mode, network, and stale rollup notices in stable order", () => {
  const notices = buildMonitorStatusNotices({
    mode: "PROTECTION",
    hasNetworkFailure: true,
    rollupFreshnessStatus: "stale",
    rollupFreshnessSummary: "Rollup refresh queue is stale.",
  });

  assert.deepEqual(
    notices.map((notice) => ({
      id: notice.id,
      badge: notice.badge,
      severity: notice.severity,
    })),
    [
      { id: "mode", badge: "PROTECTION", severity: "critical" },
      { id: "network", badge: "Telemetry gap", severity: "warning" },
      { id: "rollup", badge: "Rollup stale", severity: "critical" },
    ],
  );
});

test("resolveInitialMonitorStatusDetailsOpen opens critical notices on desktop and stays compact on mobile", () => {
  const notices = buildMonitorStatusNotices({
    mode: "PROTECTION",
    hasNetworkFailure: false,
    rollupFreshnessStatus: "warming",
    rollupFreshnessSummary: "Rollup refresh queue is warming.",
  });

  assert.equal(resolveInitialMonitorStatusDetailsOpen({ notices, isMobile: false }), true);
  assert.equal(resolveInitialMonitorStatusDetailsOpen({ notices, isMobile: true }), false);
  assert.equal(resolveInitialMonitorStatusDetailsOpen({ notices: [], isMobile: false }), false);
});

test("buildMonitorStatusSummaryFacts and text keep operator summary compact and stable", () => {
  const notices = buildMonitorStatusNotices({
    mode: "PROTECTION",
    hasNetworkFailure: true,
    rollupFreshnessStatus: "fresh",
    rollupFreshnessSummary: "fresh",
  });

  assert.deepEqual(buildMonitorStatusSummaryFacts(notices), [
    { label: "Critical", value: "1", severity: "critical" },
    { label: "Warning", value: "1", severity: "warning" },
  ]);
  assert.equal(buildMonitorStatusHeadline(notices), "Immediate operator review needed");
  assert.equal(
    buildMonitorStatusSummaryText(notices),
    "1 critical and 1 warning notices affecting live monitor visibility.",
  );
});
