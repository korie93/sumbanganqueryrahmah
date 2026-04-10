import test from "node:test";
import assert from "node:assert/strict";
import {
  getLighthouseRuntimeErrorCode,
  isRetryableLighthouseRuntimeError,
  isUsableLighthouseReport,
  summarizeObservedWebVitalsFromLog,
  summarizeLighthouseReport,
} from "../lib/pagespeed-local.mjs";

test("getLighthouseRuntimeErrorCode returns runtime error code when present", () => {
  assert.equal(
    getLighthouseRuntimeErrorCode({
      runtimeError: {
        code: "NO_NAVSTART",
      },
    }),
    "NO_NAVSTART",
  );
});

test("isRetryableLighthouseRuntimeError only retries NO_NAVSTART", () => {
  assert.equal(
    isRetryableLighthouseRuntimeError({
      runtimeError: {
        code: "NO_NAVSTART",
      },
    }),
    true,
  );
  assert.equal(
    isRetryableLighthouseRuntimeError({
      runtimeError: {
        code: "PROTOCOL_TIMEOUT",
      },
    }),
    false,
  );
  assert.equal(isRetryableLighthouseRuntimeError({}), false);
});

test("summarizeLighthouseReport formats scores and key metrics", () => {
  const summary = summarizeLighthouseReport({
    categories: {
      performance: { score: 0.93 },
      accessibility: { score: 1 },
      "best-practices": { score: 0.99 },
      seo: { score: 0.63 },
    },
    audits: {
      "first-contentful-paint": { displayValue: "2.4\u00a0s" },
      "largest-contentful-paint": { displayValue: "2.7\u00a0s" },
      "total-blocking-time": { displayValue: "20\u00a0ms" },
      "cumulative-layout-shift": { displayValue: "0" },
    },
  });

  assert.deepEqual(summary, {
    runtimeErrorCode: null,
    performance: 93,
    accessibility: 100,
    bestPractices: 99,
    seo: 63,
    fcp: "2.4 s",
    lcp: "2.7 s",
    tbt: "20 ms",
    cls: "0",
  });
});

test("isUsableLighthouseReport only accepts reports without runtime errors", () => {
  assert.equal(isUsableLighthouseReport({}), true);
  assert.equal(
    isUsableLighthouseReport({
      runtimeError: {
        code: "NO_NAVSTART",
      },
    }),
    false,
  );
});

test("summarizeObservedWebVitalsFromLog extracts latest navigate metrics for the expected profile", () => {
  const logText = [
    "not-json",
    JSON.stringify({
      httpPath: "/telemetry/web-vitals",
      path: "/login",
      navigationType: "navigate",
      metric: "FCP",
      value: 4100,
      rating: "poor",
      userAgent: "Mozilla/5.0 (Linux; Android 11) Mobile",
      capturedAt: "2026-04-10T01:00:00.000Z",
    }),
    JSON.stringify({
      httpPath: "/telemetry/web-vitals",
      path: "/login",
      navigationType: "back-forward-cache",
      metric: "LCP",
      value: 10,
      rating: "good",
      userAgent: "Mozilla/5.0 (Linux; Android 11) Mobile",
      capturedAt: "2026-04-10T01:00:00.500Z",
    }),
    JSON.stringify({
      httpPath: "/telemetry/web-vitals",
      path: "/login",
      navigationType: "navigate",
      metric: "TTFB",
      value: 8,
      rating: "good",
      userAgent: "Mozilla/5.0 (Linux; Android 11) Mobile",
      capturedAt: "2026-04-10T01:00:01.000Z",
    }),
    JSON.stringify({
      httpPath: "/telemetry/web-vitals",
      path: "/login",
      navigationType: "navigate",
      metric: "LCP",
      value: 356,
      rating: "good",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HeadlessChrome/146.0.0.0",
      capturedAt: "2026-04-10T01:00:02.000Z",
    }),
    JSON.stringify({
      httpPath: "/telemetry/web-vitals",
      path: "/login",
      navigationType: "navigate",
      metric: "CLS",
      value: 0,
      rating: "good",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HeadlessChrome/146.0.0.0",
      capturedAt: "2026-04-10T01:00:03.000Z",
    }),
    JSON.stringify({
      httpPath: "/telemetry/web-vitals",
      path: "/login",
      navigationType: "navigate",
      metric: "FCP",
      value: 288,
      rating: "good",
      userAgent: "Mozilla/5.0 (Linux; Android 11) Mobile",
      capturedAt: "2026-04-10T01:00:04.000Z",
    }),
    JSON.stringify({
      httpPath: "/telemetry/web-vitals",
      path: "/login",
      navigationType: "navigate",
      metric: "FCP",
      value: 222,
      rating: "good",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HeadlessChrome/146.0.0.0",
      capturedAt: "2026-04-10T01:00:05.000Z",
    }),
  ].join("\n");

  assert.deepEqual(
    summarizeObservedWebVitalsFromLog(logText, {
      path: "/login",
      preset: "perf",
      since: "2026-04-10T01:00:00.000Z",
    }),
    {
      source: "server-telemetry",
      userAgentProfile: "mobile",
      capturedAt: "2026-04-10T01:00:04.000Z",
      fcp: "288 ms",
      lcp: "356 ms",
      ttfb: "8 ms",
      cls: "0",
      ratings: {
        fcp: "good",
        lcp: "good",
        ttfb: "good",
        cls: "good",
      },
    },
  );
});

test("summarizeObservedWebVitalsFromLog filters for desktop audits", () => {
  const logText = [
    JSON.stringify({
      httpPath: "/telemetry/web-vitals",
      path: "/login",
      navigationType: "navigate",
      metric: "FCP",
      value: 356,
      rating: "good",
      userAgent: "Mozilla/5.0 (Linux; Android 11) Mobile",
      capturedAt: "2026-04-10T01:00:01.000Z",
    }),
    JSON.stringify({
      httpPath: "/telemetry/web-vitals",
      path: "/login",
      navigationType: "navigate",
      metric: "FCP",
      value: 264,
      rating: "good",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HeadlessChrome/146.0.0.0",
      capturedAt: "2026-04-10T01:00:02.000Z",
    }),
  ].join("\n");

  assert.deepEqual(
    summarizeObservedWebVitalsFromLog(logText, {
      path: "/login",
      preset: "desktop",
      since: "2026-04-10T01:00:00.000Z",
    }),
    {
      source: "server-telemetry",
      userAgentProfile: "desktop",
      capturedAt: "2026-04-10T01:00:02.000Z",
      fcp: "264 ms",
      lcp: "n/a",
      ttfb: "n/a",
      cls: "n/a",
      ratings: {
        fcp: "good",
      },
    },
  );
});
