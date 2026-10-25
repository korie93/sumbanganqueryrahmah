import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { webVitalTelemetrySchema, type WebVitalTelemetryPayload } from "@shared/web-vitals";
import { buildWebVitalPayload, classifyWebVitalPageType, sanitizeTelemetryPath, sendWebVitalPayload } from "./web-vitals";

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

function createInpCorrection() {
  return buildWebVitalPayload({
    name: "INP", value: 184, delta: -96, rating: "good", id: "inp-correction",
    navigationType: "navigate",
  }, { pathname: "/login?token=private", capturedAt: "2026-10-25T08:00:00.000Z" });
}

function mockBeacon(context: TestContext, sendBeacon: Navigator["sendBeacon"]) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon } });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  });
}

test("improving INP measurements preserve their signed delta through the telemetry contract", () => {
  const payload = createInpCorrection();
  assert.equal(payload.delta, -96);
  assert.equal(payload.value, 184);
  assert.equal(payload.path, "/login");
  assert.equal(webVitalTelemetrySchema.safeParse(payload).success, true);
});

test("valid INP corrections use one beacon without a duplicate fetch", async (context) => {
  const beacons: Array<{ url: string; body: Blob }> = [];
  mockBeacon(context, (url, body) => {
    assert.ok(body instanceof Blob);
    beacons.push({ url: String(url), body });
    return true;
  });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  sendWebVitalPayload(createInpCorrection());
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0]?.url, "/api/telemetry/web-vitals");
  assert.equal(beacons[0]?.body.type, "application/json");
  assert.deepEqual(JSON.parse(await beacons[0]!.body.text()), createInpCorrection());
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("unavailable beacons fall back once to the bounded same-origin keepalive request", async (context) => {
  mockBeacon(context, () => false);
  const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  sendWebVitalPayload(createInpCorrection());
  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, options] = fetchMock.mock.calls[0]!.arguments;
  assert.equal(url, "/api/telemetry/web-vitals");
  assert.equal(options?.method, "POST");
  assert.equal(options?.keepalive, true);
  assert.equal(options?.credentials, "same-origin");
  assert.deepEqual(JSON.parse(String(options?.body)), createInpCorrection());
});

test("unsupported samples reach neither beacon nor fetch and are never clamped", (context) => {
  let beaconCalls = 0;
  mockBeacon(context, () => { beaconCalls += 1; return true; });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  const invalid: Partial<WebVitalTelemetryPayload>[] = [
    { value: NaN }, { value: Infinity }, { value: -1 }, { value: 120_000.1 },
    { delta: NaN }, { delta: Infinity }, { delta: -120_000.1 }, { delta: 120_000.1 },
    { id: "" }, { path: "/" + "x".repeat(512) },
  ];
  for (const fields of invalid) sendWebVitalPayload({ ...createInpCorrection(), ...fields });
  const sensitive = { ...createInpCorrection(), token: "must-not-be-sent" };
  sendWebVitalPayload(sensitive);
  assert.equal(beaconCalls, 0);
  assert.equal(fetchMock.mock.callCount(), 0);
});
