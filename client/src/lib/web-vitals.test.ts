import assert from "node:assert/strict";
import test from "node:test";
import { buildWebVitalPayload, classifyWebVitalPageType, sanitizeTelemetryPath } from "./web-vitals";

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

test("sanitizeTelemetryPath redacts identifier-like route segments and strips query strings", () => {
  assert.equal(sanitizeTelemetryPath("/collection/123456789"), "/collection/:number");
  assert.equal(
    sanitizeTelemetryPath("/records/550e8400-e29b-41d4-a716-446655440000/details"),
    "/records/:id/details",
  );
  assert.equal(sanitizeTelemetryPath("/login?token=secret#fragment"), "/login");
  assert.equal(sanitizeTelemetryPath("monitor/overview"), "/monitor/overview");
});

test("buildWebVitalPayload stores sanitized telemetry paths only", () => {
  const payload = buildWebVitalPayload(
    {
      name: "LCP",
      value: 100,
      delta: 10,
      rating: "good",
      id: "metric-2",
      navigationType: "navigate",
    },
    {
      pathname: "/collection/123456789?customer=private",
      capturedAt: "2026-04-04T09:15:00.000Z",
    },
  );

  assert.equal(payload.path, "/collection/:number");
  assert.equal(payload.pageType, "authenticated");
});
