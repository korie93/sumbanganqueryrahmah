import assert from "node:assert/strict";
import test from "node:test";
import { WebVitalsTelemetryService } from "../web-vitals-telemetry.service";
import { sanitizeWebVitalTelemetryPath } from "../../../shared/web-vitals";

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

test("WebVitalsTelemetryService samples non-poor info logs while preserving poor warnings", () => {
  const infoLogs: unknown[] = [];
  const warnLogs: unknown[] = [];
  const service = new WebVitalsTelemetryService({
    logger: {
      info(_message, meta) {
        infoLogs.push(meta);
      },
      warn(_message, meta) {
        warnLogs.push(meta);
      },
    },
    infoLogSampleRate: 2,
  });

  service.record({
    name: "FCP",
    value: 600,
    delta: 10,
    rating: "good",
    id: "fcp-1",
    path: "/login",
    pageType: "public",
    ts: "2026-04-04T09:00:00.000Z",
  });
  service.record({
    name: "FCP",
    value: 700,
    delta: 20,
    rating: "good",
    id: "fcp-2",
    path: "/login",
    pageType: "public",
    ts: "2026-04-04T09:00:01.000Z",
  });
  service.record({
    name: "LCP",
    value: 4_500,
    delta: 300,
    rating: "poor",
    id: "lcp-poor",
    path: "/",
    pageType: "public",
    ts: "2026-04-04T09:00:02.000Z",
  });
  service.record({
    name: "TTFB",
    value: 200,
    delta: 30,
    rating: "good",
    id: "ttfb-1",
    path: "/",
    pageType: "public",
    ts: "2026-04-04T09:00:03.000Z",
  });

  assert.equal(infoLogs.length, 2);
  assert.equal(warnLogs.length, 1);
});

test("WebVitalsTelemetryService redacts identifier-like paths before storing and logging", () => {
  const infoLogs: unknown[] = [];
  const service = new WebVitalsTelemetryService({
    logger: {
      info(_message, meta) {
        infoLogs.push(meta);
      },
      warn() {},
    },
    infoLogSampleRate: 1,
  });

  service.record({
    name: "LCP",
    value: 1200,
    delta: 30,
    rating: "good",
    id: "lcp-sensitive",
    path: "/collection/123456789?customer=private",
    pageType: "authenticated",
    ts: "2026-04-04T09:00:00.000Z",
  });
  service.record({
    name: "INP",
    value: 150,
    delta: 5,
    rating: "good",
    id: "inp-sensitive",
    path: "/records/550e8400-e29b-41d4-a716-446655440000/details",
    pageType: "authenticated",
    ts: "2026-04-04T09:00:01.000Z",
  });

  const overview = service.getOverview(Date.parse("2026-04-04T09:00:02.000Z"));
  const authenticatedSummary = overview.pageSummaries.find(
    (summary) => summary.pageType === "authenticated",
  );
  const latestLcp = authenticatedSummary?.metrics.find((metric) => metric.name === "LCP");
  const latestInp = authenticatedSummary?.metrics.find((metric) => metric.name === "INP");

  assert.equal(sanitizeWebVitalTelemetryPath("/collection/123456789"), "/collection/:number");
  assert.equal(latestLcp?.latestPath, "/collection/:number");
  assert.equal(latestInp?.latestPath, "/records/:id/details");
  assert.equal(
    (infoLogs[0] as { path?: string } | undefined)?.path,
    "/collection/:number",
  );
});
