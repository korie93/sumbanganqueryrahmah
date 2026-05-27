import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_LIGHTHOUSE_SCORE_THRESHOLDS,
  evaluateLighthouseThresholds,
  getLighthouseRuntimeErrorCode,
  isRetryableLighthouseRuntimeError,
  isUsableLighthouseReport,
  resolveLighthouseScoreThresholds,
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

test("resolveLighthouseScoreThresholds uses audit baseline defaults and env overrides", () => {
  assert.deepEqual(
    resolveLighthouseScoreThresholds({}),
    DEFAULT_LIGHTHOUSE_SCORE_THRESHOLDS,
  );
  assert.deepEqual(
    resolveLighthouseScoreThresholds({
      PAGESPEED_MIN_PERFORMANCE_SCORE: "90",
      PAGESPEED_MIN_ACCESSIBILITY_SCORE: "96",
      PAGESPEED_MIN_BEST_PRACTICES_SCORE: "91",
      PAGESPEED_MIN_SEO_SCORE: "81",
    }),
    {
      performance: 90,
      accessibility: 96,
      bestPractices: 91,
      seo: 81,
    },
  );
  assert.throws(
    () => resolveLighthouseScoreThresholds({ PAGESPEED_MIN_SEO_SCORE: "101" }),
    /PAGESPEED_MIN_SEO_SCORE/,
  );
});

test("evaluateLighthouseThresholds reports low or missing scores", () => {
  assert.deepEqual(
    evaluateLighthouseThresholds(
      { performance: 84, accessibility: 95, bestPractices: null, seo: 80 },
      DEFAULT_LIGHTHOUSE_SCORE_THRESHOLDS,
    ),
    [
      {
        key: "performance",
        label: "Performance",
        actual: 84,
        minimum: 85,
        message: "Performance score 84 is below required 85.",
      },
      {
        key: "bestPractices",
        label: "Best Practices",
        actual: null,
        minimum: 90,
        message: "Best Practices score is missing; expected at least 90.",
      },
    ],
  );
});

test("strict PageSpeed runner and CI enforce Lighthouse thresholds", () => {
  const runnerSource = readFileSync("scripts/run-pagespeed-local.mjs", "utf8");
  const strictRunnerSource = readFileSync("scripts/run-pagespeed-local-strict.mjs", "utf8");
  const ciSource = readFileSync(".github/workflows/ci.yml", "utf8");
  const docsSource = readFileSync("docs/LIGHTHOUSE_CI.md", "utf8");

  assert.match(runnerSource, /PAGESPEED_CHROME_PATH/);
  assert.match(runnerSource, /CHROME_PATH/);
  assert.match(runnerSource, /chromium\.executablePath\(\)/);
  assert.match(runnerSource, /--no-sandbox/);
  assert.match(strictRunnerSource, /PAGESPEED_ENFORCE_THRESHOLDS:\s*"true"/);
  assert.match(ciSource, /Run PageSpeed Lighthouse budgets/);
  assert.match(ciSource, /require\("playwright"\)\.chromium\.executablePath\(\)/);
  assert.match(ciSource, /PAGESPEED_CHROME_PATH=/);
  assert.match(ciSource, /PAGESPEED_REUSE_SERVER=true/);
  assert.match(ciSource, /artifacts\/pagespeed/);
  assert.match(docsSource, /Performance \| 85/);
  assert.match(docsSource, /Accessibility \| 95/);
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

test("summarizeObservedWebVitalsFromLog accepts canonical API telemetry logs", () => {
  const logText = JSON.stringify({
    httpPath: "/api/telemetry/web-vitals",
    path: "/collection",
    navigationType: "navigate",
    metric: "LCP",
    value: 1234,
    rating: "needs-improvement",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HeadlessChrome/146.0.0.0",
    capturedAt: "2026-04-10T01:00:02.000Z",
  });

  assert.deepEqual(
    summarizeObservedWebVitalsFromLog(logText, {
      path: "/collection",
      preset: "desktop",
      since: "2026-04-10T01:00:00.000Z",
    }),
    {
      source: "server-telemetry",
      userAgentProfile: "desktop",
      capturedAt: "2026-04-10T01:00:02.000Z",
      fcp: "n/a",
      lcp: "1.2 s",
      ttfb: "n/a",
      cls: "n/a",
      ratings: {
        lcp: "needs-improvement",
      },
    },
  );
});
