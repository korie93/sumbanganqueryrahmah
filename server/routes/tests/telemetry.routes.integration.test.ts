import assert from "node:assert/strict";
import test from "node:test";
import { createWebVitalsTelemetryController } from "../../controllers/web-vitals-telemetry.controller";
import { errorHandler } from "../../middleware/error-handler";
import {
  createWebVitalsTelemetryDropGuard,
  createWebVitalsTelemetryRequestGuard,
  registerTelemetryRoutes,
} from "../telemetry.routes";
import {
  createJsonTestApp,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

function createTelemetryRouteHarness(options: {
  webVitalsDropGuard?: Parameters<typeof registerTelemetryRoutes>[1]["webVitalsDropGuard"];
  webVitalsRequestGuard?: Parameters<typeof registerTelemetryRoutes>[1]["webVitalsRequestGuard"];
} = {}) {
  const recordedPayloads: Array<Record<string, unknown>> = [];

  const app = createJsonTestApp();
  registerTelemetryRoutes(app, {
    ...(options.webVitalsDropGuard ? { webVitalsDropGuard: options.webVitalsDropGuard } : {}),
    ...(options.webVitalsRequestGuard ? { webVitalsRequestGuard: options.webVitalsRequestGuard } : {}),
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

function createValidWebVitalsPayload(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
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
      body: JSON.stringify(createValidWebVitalsPayload()),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 1);
    assert.equal(recordedPayloads[0]?.name, "LCP");
    assert.equal(recordedPayloads[0]?.path, "/login");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals silently drops excess samples per client window", async () => {
  let nowMs = 1_000;
  const { app, recordedPayloads } = createTelemetryRouteHarness({
    webVitalsDropGuard: createWebVitalsTelemetryDropGuard({
      maxEventsPerWindow: 2,
      now: () => nowMs,
      windowMs: 1_000,
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  const postMetric = (id: string) => fetch(`${baseUrl}/telemetry/web-vitals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createValidWebVitalsPayload({ id })),
  });

  try {
    const first = await postMetric("v3-1710000000000-1");
    const second = await postMetric("v3-1710000000000-2");
    const dropped = await postMetric("v3-1710000000000-3");

    assert.equal(first.status, 204);
    assert.equal(second.status, 204);
    assert.equal(dropped.status, 204);
    assert.equal(recordedPayloads.length, 2);

    nowMs += 1_001;
    const afterWindow = await postMetric("v3-1710000000000-4");
    assert.equal(afterWindow.status, 204);
    assert.equal(recordedPayloads.length, 3);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals silently drops cross-site browser telemetry attempts", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness({
    webVitalsRequestGuard: createWebVitalsTelemetryRequestGuard({
      allowedOrigins: ["https://sqr-system.test"],
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site",
      },
      body: JSON.stringify(createValidWebVitalsPayload()),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals silently drops non-json telemetry bodies", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: JSON.stringify(createValidWebVitalsPayload()),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /telemetry/web-vitals silently drops oversized telemetry bodies before recording", async () => {
  const { app, recordedPayloads } = createTelemetryRouteHarness({
    webVitalsRequestGuard: createWebVitalsTelemetryRequestGuard({
      maxContentLengthBytes: 128,
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createValidWebVitalsPayload({
        id: `v3-${"oversized".repeat(20)}`,
      })),
    });

    assert.equal(response.status, 204);
    assert.equal(recordedPayloads.length, 0);
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
