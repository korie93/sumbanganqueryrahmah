import test from "node:test";
import assert from "node:assert/strict";
import {
  getLighthouseRuntimeErrorCode,
  isRetryableLighthouseRuntimeError,
  isUsableLighthouseReport,
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
      "first-contentful-paint": { displayValue: "2.4 s" },
      "largest-contentful-paint": { displayValue: "2.7 s" },
      "total-blocking-time": { displayValue: "20 ms" },
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
