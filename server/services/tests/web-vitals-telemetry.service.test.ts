import assert from "node:assert/strict";
import test from "node:test";
import { WebVitalsTelemetryService } from "../web-vitals-telemetry.service";

test("WebVitalsTelemetryService builds page summaries with p75 ratings", () => {
  const service = new WebVitalsTelemetryService({
    logger: {
      info() {},
      warn() {},
    },
    maxSamples: 20,
    maxAgeMs: 15 * 60 * 1000,
  });

  service.record({
    name: "LCP",
    value: 1800,
    delta: 40,
    rating: "good",
    id: "lcp-1",
    path: "/login",
    pageType: "public",
    ts: "2026-04-04T09:00:00.000Z",
  });
  service.record({
    name: "LCP",
    value: 2600,
    delta: 100,
    rating: "needs-improvement",
    id: "lcp-2",
    path: "/",
    pageType: "public",
    ts: "2026-04-04T09:01:00.000Z",
  });
  service.record({
    name: "LCP",
    value: 4200,
    delta: 300,
    rating: "poor",
    id: "lcp-3",
    path: "/",
    pageType: "public",
    ts: "2026-04-04T09:02:00.000Z",
  });
  service.record({
    name: "INP",
    value: 180,
    delta: 12,
    rating: "good",
    id: "inp-1",
    path: "/monitor",
    pageType: "authenticated",
    ts: "2026-04-04T09:03:00.000Z",
  });

  const overview = service.getOverview(Date.parse("2026-04-04T09:04:00.000Z"));
  const publicSummary = overview.pageSummaries.find((summary) => summary.pageType === "public");
  const authenticatedSummary = overview.pageSummaries.find(
    (summary) => summary.pageType === "authenticated",
  );

  assert.equal(overview.totalSamples, 4);
  assert.equal(publicSummary?.sampleCount, 3);
  assert.equal(publicSummary?.latestCapturedAt, "2026-04-04T09:02:00.000Z");

  const publicLcp = publicSummary?.metrics.find((metric) => metric.name === "LCP");
  assert.equal(publicLcp?.sampleCount, 3);
  assert.equal(publicLcp?.latestValue, 4200);
  assert.equal(publicLcp?.p75, 4200);
  assert.equal(publicLcp?.p75Rating, "poor");

  const authenticatedInp = authenticatedSummary?.metrics.find((metric) => metric.name === "INP");
  assert.equal(authenticatedInp?.sampleCount, 1);
  assert.equal(authenticatedInp?.p75, 180);
  assert.equal(authenticatedInp?.p75Rating, "good");
});

test("WebVitalsTelemetryService prunes stale samples outside the retention window", () => {
  const service = new WebVitalsTelemetryService({
    logger: {
      info() {},
      warn() {},
    },
    maxSamples: 20,
    maxAgeMs: 60_000,
  });

  service.record({
    name: "CLS",
    value: 0.09,
    delta: 0.01,
    rating: "good",
    id: "cls-old",
    path: "/login",
    pageType: "public",
    ts: "2026-04-04T09:00:00.000Z",
  });
  service.record({
    name: "CLS",
    value: 0.12,
    delta: 0.02,
    rating: "needs-improvement",
    id: "cls-new",
    path: "/login",
    pageType: "public",
    ts: "2026-04-04T09:01:00.000Z",
  });

  const overview = service.getOverview(Date.parse("2026-04-04T09:01:30.000Z"));
  const publicSummary = overview.pageSummaries.find((summary) => summary.pageType === "public");
  const publicCls = publicSummary?.metrics.find((metric) => metric.name === "CLS");

  assert.equal(overview.totalSamples, 1);
  assert.equal(publicSummary?.sampleCount, 1);
  assert.equal(publicCls?.sampleCount, 1);
  assert.equal(publicCls?.latestValue, 0.12);
});
