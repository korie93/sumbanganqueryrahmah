import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonitorWebVitalCompactSummary,
  buildMonitorWebVitalPrimaryMetricBadges,
  buildMonitorWebVitalSummaryFacts,
  resolveMonitorWebVitalOpenPageTypes,
} from "@/components/monitor/monitor-web-vitals-utils";
import type { WebVitalOverviewPayload, WebVitalPageSummary } from "@shared/web-vitals";

function createPageSummary(pageType: WebVitalPageSummary["pageType"]): WebVitalPageSummary {
  return {
    pageType,
    sampleCount: 12,
    latestCapturedAt: "2026-04-04T12:00:00.000Z",
    metrics: [
      {
        name: "CLS",
        sampleCount: 12,
        p75: 0.091,
        p75Rating: "good",
        latestValue: 0.041,
        latestRating: "good",
        latestCapturedAt: "2026-04-04T12:00:00.000Z",
        latestPath: "/",
      },
      {
        name: "FCP",
        sampleCount: 12,
        p75: 710,
        p75Rating: "good",
        latestValue: 632,
        latestRating: "good",
        latestCapturedAt: "2026-04-04T12:00:00.000Z",
        latestPath: "/",
      },
      {
        name: "INP",
        sampleCount: 12,
        p75: 182,
        p75Rating: "needs-improvement",
        latestValue: 176,
        latestRating: "needs-improvement",
        latestCapturedAt: "2026-04-04T12:00:00.000Z",
        latestPath: "/monitor",
      },
      {
        name: "LCP",
        sampleCount: 12,
        p75: 2104,
        p75Rating: "needs-improvement",
        latestValue: 2010,
        latestRating: "needs-improvement",
        latestCapturedAt: "2026-04-04T12:00:00.000Z",
        latestPath: "/login",
      },
      {
        name: "TTFB",
        sampleCount: 12,
        p75: 389,
        p75Rating: "good",
        latestValue: 341,
        latestRating: "good",
        latestCapturedAt: "2026-04-04T12:00:00.000Z",
        latestPath: "/login",
      },
    ],
  };
}

function createOverviewPayload(overrides: Partial<WebVitalOverviewPayload> = {}): WebVitalOverviewPayload {
  return {
    windowMinutes: 15,
    totalSamples: 24,
    updatedAt: "2026-04-04T12:05:00.000Z",
    pageSummaries: [createPageSummary("public"), createPageSummary("authenticated")],
    ...overrides,
  };
}

test("resolveMonitorWebVitalOpenPageTypes removes stale page types and keeps user-collapsed state", () => {
  const result = resolveMonitorWebVitalOpenPageTypes(
    ["public", "authenticated"],
    ["authenticated", "stale" as WebVitalPageSummary["pageType"], "authenticated"],
  );

  assert.deepEqual(result, ["authenticated"]);
  assert.deepEqual(resolveMonitorWebVitalOpenPageTypes(["public"], []), []);
});

test("buildMonitorWebVitalPrimaryMetricBadges keeps compact summary badges in LCP INP CLS order", () => {
  const result = buildMonitorWebVitalPrimaryMetricBadges(createPageSummary("public"));

  assert.deepEqual(result, [
    {
      name: "LCP",
      p75: 2104,
      p75Rating: "needs-improvement",
    },
    {
      name: "INP",
      p75: 182,
      p75Rating: "needs-improvement",
    },
    {
      name: "CLS",
      p75: 0.091,
      p75Rating: "good",
    },
  ]);
});

test("buildMonitorWebVitalCompactSummary reports healthy, watch, and waiting states predictably", () => {
  assert.deepEqual(
    buildMonitorWebVitalCompactSummary(
      createOverviewPayload({
        pageSummaries: [
          {
            ...createPageSummary("public"),
            metrics: createPageSummary("public").metrics.map((metric) =>
              metric.name === "LCP" || metric.name === "INP"
                ? { ...metric, p75Rating: "good" }
                : metric,
            ),
          },
        ],
      }),
    ),
    {
      tone: "stable",
      badge: "Healthy",
      headline: "Recent sessions are staying within current vitals thresholds.",
      description: "24 recent samples are tracking cleanly across 1 monitored surface.",
    },
  );

  assert.deepEqual(
    buildMonitorWebVitalCompactSummary(
      createOverviewPayload({
        pageSummaries: [
          {
            ...createPageSummary("public"),
            metrics: createPageSummary("public").metrics.map((metric) =>
              metric.name === "LCP" ? { ...metric, p75Rating: "poor" } : metric,
            ),
          },
        ],
      }),
    ),
    {
      tone: "attention",
      badge: "Attention",
      headline: "Recent sessions show degraded browser experience.",
      description: "1 primary vital is in the poor range across 1 monitored surface.",
    },
  );

  assert.deepEqual(
    buildMonitorWebVitalCompactSummary(
      createOverviewPayload({
        totalSamples: 0,
        pageSummaries: [],
      }),
    ),
    {
      tone: "watch",
      badge: "Waiting",
      headline: "Recent browser telemetry has not arrived yet.",
      description: "The current 15-minute window is still waiting for real session samples.",
    },
  );
});

test("buildMonitorWebVitalSummaryFacts keeps compact badges stable for samples and health", () => {
  assert.deepEqual(buildMonitorWebVitalSummaryFacts(createOverviewPayload()), [
    {
      label: "Samples",
      value: "24",
      tone: "stable",
    },
    {
      label: "Surfaces",
      value: "2",
      tone: "stable",
    },
    {
      label: "Watch",
      value: "4",
      tone: "watch",
    },
  ]);
});
