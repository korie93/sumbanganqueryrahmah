import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonitorChaosCompactSummary,
  buildMonitorChaosSummaryFacts,
} from "@/components/monitor/monitor-chaos-utils";
import { CHAOS_OPTIONS } from "@/components/monitor/monitorData";

const selectedChaosProfile = CHAOS_OPTIONS[0];

test("buildMonitorChaosCompactSummary keeps restricted and running states predictable", () => {
  assert.deepEqual(
    buildMonitorChaosCompactSummary({
      canInjectChaos: false,
      selectedChaosProfile,
      chaosDurationMs: "",
      chaosLoading: false,
      lastChaosMessage: null,
    }),
    {
      tone: "watch",
      badge: "Restricted",
      headline: "Fault-injection controls are limited to privileged operators.",
      description:
        "The current scenario profile remains visible for context, with CPU Spike prepared for 20s when privileged access is available.",
    },
  );

  assert.deepEqual(
    buildMonitorChaosCompactSummary({
      canInjectChaos: true,
      selectedChaosProfile,
      chaosDurationMs: "9000",
      chaosLoading: true,
      lastChaosMessage: null,
    }),
    {
      tone: "attention",
      badge: "Running",
      headline: "CPU Spike is currently being injected.",
      description:
        "The active scenario is set for 9.0s. Controls stay hidden until operators need to adjust or review the next run.",
    },
  );
});

test("buildMonitorChaosSummaryFacts exposes access, scenario, duration, and status badges", () => {
  assert.deepEqual(
    buildMonitorChaosSummaryFacts({
      canInjectChaos: true,
      selectedChaosProfile,
      chaosDurationMs: "9000",
      chaosLoading: true,
    }),
    [
      {
        label: "Access",
        value: "Ready",
        tone: "stable",
      },
      {
        label: "Scenario",
        value: "CPU Spike",
        tone: "stable",
      },
      {
        label: "Duration",
        value: "9.0s",
        tone: "stable",
      },
      {
        label: "Status",
        value: "Running",
        tone: "attention",
      },
    ],
  );
});
