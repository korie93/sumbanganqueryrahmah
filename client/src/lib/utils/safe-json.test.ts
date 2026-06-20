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

test("safeJsonParse returns fallback when client JSON limits are exceeded", () => {
  const fallback = { enabled: false };
  const deepPayload = "{\"a\":{\"b\":{\"c\":true}}}";

  assert.deepEqual(
    safeJsonParse(
      '{"enabled":true}',
      fallback,
      "bounded-config",
      { DEV: false },
      { maxRawLength: 10 },
    ),
    fallback,
  );
  assert.deepEqual(
    safeJsonParse(
      deepPayload,
      fallback,
      "bounded-config",
      { DEV: false },
      { maxDepth: 1 },
    ),
    fallback,
  );
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

test("safeJsonParseResult reports limit failures without throwing", () => {
  const tooLarge = safeJsonParseResult<unknown>('{"enabled":true}', { maxRawLength: 8 });
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) {
    assert.match(tooLarge.error, /size exceeds limit/i);
  }

  const tooManyNodes = safeJsonParseResult<unknown>("[1,2,3,4]", { maxNodes: 3 });
  assert.equal(tooManyNodes.ok, false);
  if (!tooManyNodes.ok) {
    assert.match(tooManyNodes.error, /node count exceeds limit/i);
  }

  const tooLongString = safeJsonParseResult<unknown>('"abcdef"', { maxStringLength: 3 });
  assert.equal(tooLongString.ok, false);
  if (!tooLongString.ok) {
    assert.match(tooLongString.error, /string length exceeds limit/i);
  }
});

test("safeJsonParseResult returns typed data for valid JSON", () => {
  assert.deepEqual(safeJsonParseResult<string[]>('["a","b"]'), {
    ok: true,
    data: ["a", "b"],
  });
});
