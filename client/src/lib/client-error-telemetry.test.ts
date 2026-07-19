import assert from "node:assert/strict";
import test from "node:test";
import {
  createClientErrorFingerprint,
  createClientErrorReporter,
} from "@/lib/client-error-telemetry";
import {
  sanitizeClientErrorTelemetryPath,
  type ClientErrorTelemetryPayload,
} from "@shared/client-error-telemetry";

function createFixedStackError(message: string) {
  const error = new TypeError(message);
  error.stack = `${error.name}: ${message}\n    at DashboardWidget (assets/dashboard.js:10:20)`;
  return error;
}

test("client error fingerprints do not depend on raw error messages", () => {
  const first = createClientErrorFingerprint({
    source: "route_render",
    error: createFixedStackError("customer name one"),
  });
  const second = createClientErrorFingerprint({
    source: "route_render",
    error: createFixedStackError("customer name two"),
  });

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{16}$/);
});

test("client error paths fail closed when a URL could contain user-controlled data", () => {
  assert.equal(
    sanitizeClientErrorTelemetryPath("/monitor?customer=private#details"),
    "/monitor",
  );
  assert.equal(
    sanitizeClientErrorTelemetryPath("/customer/private-name"),
    "/unknown",
  );
  assert.equal(
    sanitizeClientErrorTelemetryPath("/collection/123456789?customer=private"),
    "/unknown",
  );
});

test("production reporter emits only strict sanitized crash metadata", () => {
  const sent: ClientErrorTelemetryPayload[] = [];
  const report = createClientErrorReporter({
    env: { PROD: true },
    getOnline: () => true,
    getPathname: () => "/collection/records?customer=private#details",
    getVisibilityState: () => "visible",
    isAutomatedBrowser: () => false,
    now: () => new Date("2026-07-19T08:30:00.000Z"),
    releaseSha: "A".repeat(40),
    send: (payload) => sent.push(payload),
  });

  report({
    source: "route_render",
    error: createFixedStackError("secret customer input"),
    fingerprintContext: "\n    at CollectionPage",
  });

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    source: "route_render",
    errorName: "TypeError",
    fingerprint: sent[0]?.fingerprint,
    path: "/collection/records",
    pageType: "authenticated",
    releaseSha: "a".repeat(40),
    visibilityState: "visible",
    online: true,
    ts: "2026-07-19T08:30:00.000Z",
  });
  assert.equal("message" in (sent[0] ?? {}), false);
  assert.equal("stack" in (sent[0] ?? {}), false);
  assert.equal(JSON.stringify(sent[0]).includes("secret customer input"), false);
  assert.equal(JSON.stringify(sent[0]).includes("customer=private"), false);
});

test("client error reporter stays silent in development and browser automation", () => {
  const sent: ClientErrorTelemetryPayload[] = [];
  const developmentReporter = createClientErrorReporter({
    env: { PROD: false },
    isAutomatedBrowser: () => false,
    send: (payload) => sent.push(payload),
  });
  const automatedReporter = createClientErrorReporter({
    env: { PROD: true },
    isAutomatedBrowser: () => true,
    send: (payload) => sent.push(payload),
  });

  developmentReporter({ source: "window_error", error: new Error("dev") });
  automatedReporter({ source: "window_error", error: new Error("automation") });

  assert.equal(sent.length, 0);
});

test("client error reporter suppresses duplicates and evicts bounded old fingerprints", () => {
  let nowMs = Date.parse("2026-07-19T08:30:00.000Z");
  const sent: ClientErrorTelemetryPayload[] = [];
  const report = createClientErrorReporter({
    dedupeWindowMs: 1_000,
    env: { PROD: true },
    getPathname: () => "/monitor",
    isAutomatedBrowser: () => false,
    maxRecentFingerprints: 2,
    now: () => new Date(nowMs),
    send: (payload) => sent.push(payload),
  });
  const first = createFixedStackError("first");
  first.stack = "Error: first\n    at FirstPanel (assets/app.js:1:1)";
  const second = createFixedStackError("second");
  second.stack = "Error: second\n    at SecondPanel (assets/app.js:2:2)";
  const third = createFixedStackError("third");
  third.stack = "Error: third\n    at ThirdPanel (assets/app.js:3:3)";

  report({ source: "route_render", error: first });
  report({ source: "route_render", error: first });
  report({ source: "route_render", error: second });
  report({ source: "route_render", error: third });
  report({ source: "route_render", error: first });

  assert.equal(sent.length, 4);

  nowMs += 1_001;
  report({ source: "route_render", error: third });
  assert.equal(sent.length, 5);
});
