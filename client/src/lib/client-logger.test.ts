import assert from "node:assert/strict";
import test from "node:test";

import { logClientError, logClientWarning, shouldLogClientDiagnostics } from "@/lib/client-logger";

test("shouldLogClientDiagnostics only enables client diagnostics in dev or explicit debug mode", () => {
  assert.equal(shouldLogClientDiagnostics({}), false);
  assert.equal(shouldLogClientDiagnostics({ DEV: false, VITE_CLIENT_DEBUG: "0" }), false);
  assert.equal(shouldLogClientDiagnostics({ DEV: true }), true);
  assert.equal(shouldLogClientDiagnostics({ VITE_CLIENT_DEBUG: "1" }), true);
});

test("logClientError stays silent outside client diagnostic mode", () => {
  const captured: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = ((...args: unknown[]) => {
    captured.push(args);
  }) as typeof console.error;

  try {
    logClientError("silent message", new Error("boom"), { feature: "login" }, { DEV: false, VITE_CLIENT_DEBUG: "0" });
    assert.deepEqual(captured, []);
  } finally {
    console.error = originalConsoleError;
  }
});

test("logClientError forwards sanitized telemetry when client error telemetry is enabled", async () => {
  const capturedRequests: Array<{ url: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  try {
    Object.assign(globalThis, {
      window: {
        location: {
          pathname: "/dashboard",
        },
      },
    });
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedRequests.push({
        url: String(input),
        body: String(init?.body || ""),
      });
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    logClientError(
      "Floating AI shell render failed",
      new Error("boom"),
      {
        source: "error-boundary",
        component: "FloatingAI",
        boundaryKey: "dashboard:1",
      },
      {
        DEV: false,
        VITE_CLIENT_DEBUG: "0",
        VITE_CLIENT_ERROR_TELEMETRY: "1",
      },
    );

    await Promise.resolve();

    assert.equal(capturedRequests.length, 1);
    assert.equal(capturedRequests[0]?.url, "/telemetry/client-errors");
    assert.match(capturedRequests[0]?.body || "", /"source":"error-boundary"/);
    assert.match(capturedRequests[0]?.body || "", /"component":"FloatingAI"/);
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(globalThis, {
      window: originalWindow,
    });
  }
});

test("logClientError writes to console during development diagnostics", () => {
  const captured: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = ((...args: unknown[]) => {
    captured.push(args);
  }) as typeof console.error;

  try {
    const error = new Error("boom");
    logClientError("dev message", error, { feature: "login" }, { DEV: true });
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], ["dev message", error, { feature: "login" }]);
  } finally {
    console.error = originalConsoleError;
  }
});

test("logClientWarning stays silent outside client diagnostic mode", () => {
  const captured: unknown[][] = [];
  const originalConsoleWarn = console.warn;
  console.warn = ((...args: unknown[]) => {
    captured.push(args);
  }) as typeof console.warn;

  try {
    logClientWarning("silent warning", new Error("boom"), undefined, { DEV: false, VITE_CLIENT_DEBUG: "0" });
    assert.deepEqual(captured, []);
  } finally {
    console.warn = originalConsoleWarn;
  }
});

test("logClientWarning writes to console during development diagnostics", () => {
  const captured: unknown[][] = [];
  const originalConsoleWarn = console.warn;
  console.warn = ((...args: unknown[]) => {
    captured.push(args);
  }) as typeof console.warn;

  try {
    const error = new Error("boom");
    logClientWarning("dev warning", error, undefined, { DEV: true });
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], ["dev warning", error]);
  } finally {
    console.warn = originalConsoleWarn;
  }
});
