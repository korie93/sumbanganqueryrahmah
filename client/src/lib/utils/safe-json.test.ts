import assert from "node:assert/strict";
import test from "node:test";
import { safeJsonParse, safeJsonParseResult } from "@/lib/utils/safe-json";

test("safeJsonParse returns parsed data for valid JSON", () => {
  assert.deepEqual(
    safeJsonParse<{ enabled: boolean }>('{"enabled":true}', { enabled: false }),
    { enabled: true },
  );
});

test("safeJsonParse returns fallback for malformed or empty input", () => {
  const fallback = { enabled: false };

  assert.deepEqual(safeJsonParse("{bad-json", fallback), fallback);
  assert.deepEqual(safeJsonParse("", fallback), fallback);
  assert.deepEqual(safeJsonParse(null, fallback), fallback);
});

test("safeJsonParse does not write console warnings outside diagnostics", () => {
  const captured: unknown[][] = [];
  const originalConsoleWarn = console.warn;
  console.warn = ((...args: unknown[]) => {
    captured.push(args);
  }) as typeof console.warn;

  try {
    assert.deepEqual(
      safeJsonParse("{bad-json", { enabled: false }, "local-storage", { DEV: false }),
      { enabled: false },
    );
    assert.deepEqual(captured, []);
  } finally {
    console.warn = originalConsoleWarn;
  }
});

test("safeJsonParse writes contextual warnings in development diagnostics", () => {
  const captured: unknown[][] = [];
  const originalConsoleWarn = console.warn;
  console.warn = ((...args: unknown[]) => {
    captured.push(args);
  }) as typeof console.warn;

  try {
    assert.deepEqual(
      safeJsonParse("{bad-json", { enabled: false }, "maintenance-state", { DEV: true }),
      { enabled: false },
    );
    assert.deepEqual(captured, [
      ["[safeJsonParse] Failed to parse JSON", { context: "maintenance-state" }],
    ]);
  } finally {
    console.warn = originalConsoleWarn;
  }
});

test("safeJsonParseResult reports parse failures without throwing", () => {
  assert.deepEqual(safeJsonParseResult<unknown>(""), { ok: false, error: "Empty input" });

  const malformed = safeJsonParseResult<unknown>("{bad-json");
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.match(malformed.error, /JSON|Expected|property/i);
  }
});

test("safeJsonParseResult returns typed data for valid JSON", () => {
  assert.deepEqual(safeJsonParseResult<string[]>('["a","b"]'), {
    ok: true,
    data: ["a", "b"],
  });
});
