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
