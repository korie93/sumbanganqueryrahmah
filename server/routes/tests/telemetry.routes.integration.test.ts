import assert from "node:assert/strict";
import test from "node:test";
import { createWebVitalsTelemetryController } from "../../controllers/web-vitals-telemetry.controller";
import { errorHandler } from "../../middleware/error-handler";
import { registerTelemetryRoutes } from "../telemetry.routes";
import {
  createJsonTestApp,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

function createTelemetryRouteHarness() {
  const recordedPayloads: Array<Record<string, unknown>> = [];

  const app = createJsonTestApp();
  registerTelemetryRoutes(app, {
    reportWebVital: createWebVitalsTelemetryController({
      webVitalsTelemetryService: {
        record(payload) {
          recordedPayloads.push(payload as Record<string, unknown>);
        },
      },
    }).report,
  });
  app.use(errorHandler);

  return {
    app,
    recordedPayloads,
  };
}

test("POST /telemetry/web-vitals accepts a valid web vitals payload", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "LCP",
        value: 2034.781,
        delta: 120.5,
        rating: "good",
        id: "v3-1710000000000-1234567890",
        path: "/login",
        pageType: "public",
        navigationType: "navigate",
        visibilityState: "visible",
        effectiveConnectionType: "4g",
        saveData: false,
        ts: "2026-04-04T08:30:00.000Z",
      }),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 1);
    assert.equal(recordedPayloads[0]?.name, "LCP");
    assert.equal(recordedPayloads[0]?.path, "/login");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals rejects malformed payloads with a validation error", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "INVALID",
        value: -1,
        delta: 0,
        rating: "good",
        id: "",
        path: "login",
        pageType: "public",
        ts: "",
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, "REQUEST_BODY_INVALID");
    assert.equal(recordedPayloads.length, 0);
  } finally {
    await stopTestServer(server);
  }
});
