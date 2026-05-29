import assert from "node:assert/strict";
import test from "node:test";
import { createInternalMetrics } from "../../internal/metrics";
import { logger } from "../../lib/logger";
import { safeJsonParse } from "../../lib/safe-json";

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
