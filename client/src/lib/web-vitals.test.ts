import assert from "node:assert/strict";
import test from "node:test";
import { buildWebVitalPayload, classifyWebVitalPageType } from "./web-vitals";

test("classifyWebVitalPageType treats public auth and landing routes as public", () => {
  assert.equal(classifyWebVitalPageType("/"), "public");
  assert.equal(classifyWebVitalPageType("/login"), "public");
  assert.equal(classifyWebVitalPageType("/forgot-password"), "public");
  assert.equal(classifyWebVitalPageType("/monitor"), "authenticated");
});

test("buildWebVitalPayload normalizes route metadata for telemetry", () => {
  const payload = buildWebVitalPayload(
    {
      name: "LCP",
      value: 2450.9,
      delta: 140.2,
      rating: "needs-improvement",
      id: "metric-1",
      navigationType: "navigate",
    },
    {
      pathname: "/login",
      visibilityState: "visible",
      effectiveConnectionType: "4g",
      saveData: false,
      capturedAt: "2026-04-04T09:15:00.000Z",
    },
  );

  assert.deepEqual(payload, {
    name: "LCP",
    value: 2450.9,
    delta: 140.2,
    rating: "needs-improvement",
    id: "metric-1",
    path: "/login",
    pageType: "public",
    navigationType: "navigate",
    visibilityState: "visible",
    effectiveConnectionType: "4g",
    saveData: false,
    ts: "2026-04-04T09:15:00.000Z",
  });
});
