import assert from "node:assert/strict";
import test from "node:test";
import { createInternalMetrics } from "../../internal/metrics";
import { logger } from "../../lib/logger";
import { safeJsonParse } from "../../lib/safe-json";

function buildNestedJson(depth: number): string {
  let json = "\"leaf\"";
  for (let index = 0; index < depth; index += 1) {
    json = `{"level":${json}}`;
  }
  return json;
}

test("safeJsonParse returns typed data for valid JSON", () => {
  const metrics = createInternalMetrics();
  const result = safeJsonParse<{ ok: boolean }>(
    "{\"ok\":true}",
    "safe_json_test_valid",
    { metrics },
  );

  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data, { ok: true });
  }
  assert.equal(metrics.snapshot().counters.jsonParseFailuresTotal, 0);
});

test("safeJsonParse reports malformed JSON without logging raw content", () => {
  const metrics = createInternalMetrics();
  const originalWarn = logger.warn;
  const warnings: Array<{ message: string; payload: unknown }> = [];
  logger.warn = ((message: string, payload: unknown) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  try {
    const result = safeJsonParse<{ secret: string }>(
      "{\"secret\":\"super-secret\",",
      "safe_json_test_malformed",
      { metrics },
    );

    assert.equal(result.success, false);
    assert.equal(metrics.snapshot().counters.jsonParseFailuresTotal, 1);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.message, "JSON parse failed");
    assert.doesNotMatch(JSON.stringify(warnings), /super-secret/);
  } finally {
    logger.warn = originalWarn;
  }
});

test("safeJsonParse rejects non-string input without throwing", () => {
  const metrics = createInternalMetrics();
  const result = safeJsonParse<unknown>(
    null,
    "safe_json_test_null",
    { metrics },
  );

  assert.equal(result.success, false);
  assert.equal(metrics.snapshot().counters.jsonParseFailuresTotal, 1);
});

test("safeJsonParse accepts JSON at the configured depth limit", () => {
  const metrics = createInternalMetrics();
  const result = safeJsonParse<unknown>(
    buildNestedJson(20),
    "safe_json_depth_limit_accepted",
    { metrics, maxDepth: 20 },
  );

  assert.equal(result.success, true);
  assert.equal(metrics.snapshot().counters.jsonParseFailuresTotal, 0);
});

test("safeJsonParse rejects JSON one level beyond the configured depth limit", () => {
  const metrics = createInternalMetrics();
  const result = safeJsonParse<unknown>(
    buildNestedJson(21),
    "safe_json_depth_limit_rejected",
    { metrics, maxDepth: 20 },
  );

  assert.equal(result.success, false);
  assert.match(result.error, /depth exceeds limit 20/);
  assert.equal(metrics.snapshot().counters.jsonParseFailuresTotal, 1);
});

test("safeJsonParse rejects deeply nested JSON without recursive measurement", () => {
  const metrics = createInternalMetrics();
  const result = safeJsonParse<unknown>(
    buildNestedJson(10_000),
    "safe_json_depth_limit_deep_rejected",
    { metrics, maxDepth: 20 },
  );

  assert.equal(result.success, false);
  assert.match(result.error, /depth exceeds limit 20/);
  assert.equal(metrics.snapshot().counters.jsonParseFailuresTotal, 1);
});

test("safeJsonParse rejects raw payloads over the configured byte limit", () => {
  const metrics = createInternalMetrics();
  const result = safeJsonParse<unknown>(
    "{\"value\":\"0123456789\"}",
    "safe_json_raw_size_limit",
    { metrics, maxRawBytes: 8 },
  );

  assert.equal(result.success, false);
  assert.match(result.error, /size exceeds limit 8/);
  assert.equal(metrics.snapshot().counters.jsonParseFailuresTotal, 1);
});

test("safeJsonParse rejects oversized arrays, objects, and strings", () => {
  const metrics = createInternalMetrics();

  const arrayResult = safeJsonParse<unknown>(
    "[1,2,3]",
    "safe_json_array_limit",
    { metrics, maxArrayLength: 2 },
  );
  const objectResult = safeJsonParse<unknown>(
    "{\"a\":1,\"b\":2,\"c\":3}",
    "safe_json_object_limit",
    { metrics, maxObjectKeys: 2 },
  );
  const stringResult = safeJsonParse<unknown>(
    "{\"value\":\"abcdef\"}",
    "safe_json_string_limit",
    { metrics, maxStringLength: 5 },
  );

  assert.equal(arrayResult.success, false);
  assert.equal(objectResult.success, false);
  assert.equal(stringResult.success, false);
  assert.equal(metrics.snapshot().counters.jsonParseFailuresTotal, 3);
});

test("safeJsonParse rejects parsed values over the cumulative byte budget", () => {
  const metrics = createInternalMetrics();
  const result = safeJsonParse<unknown>(
    "{\"first\":\"abc\",\"second\":\"def\"}",
    "safe_json_total_byte_budget",
    {
      metrics,
      maxStringLength: 10,
      maxTotalBytes: 8,
    },
  );

  assert.equal(result.success, false);
  assert.match(result.error, /cumulative byte size exceeds limit 8/);
  assert.equal(metrics.snapshot().counters.jsonParseFailuresTotal, 1);
  assert.equal(metrics.snapshot().counters.jsonParseMemoryLimitExceededTotal, 1);
});
