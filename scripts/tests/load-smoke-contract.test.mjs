import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLoadSmokeOptions,
  parseExpectedStatuses,
  parsePositiveInteger,
  summarizeLatencies,
} from "../load-smoke.mjs";

test("load smoke parser accepts positive integers and rejects unsafe values", () => {
  assert.equal(parsePositiveInteger(undefined, 5, "COUNT"), 5);
  assert.equal(parsePositiveInteger("12", 5, "COUNT"), 12);
  assert.throws(() => parsePositiveInteger("0", 5, "COUNT"), /positive integer/);
  assert.throws(() => parsePositiveInteger("1.5", 5, "COUNT"), /positive integer/);
});

test("load smoke parser normalizes expected status code lists", () => {
  assert.deepEqual(Array.from(parseExpectedStatuses("200,204,429")), [200, 204, 429]);
  assert.throws(() => parseExpectedStatuses("200,nope"), /valid HTTP status codes/);
});

test("load smoke options use staging-safe defaults and cap concurrency to request count", () => {
  const options = buildLoadSmokeOptions({
    LOAD_SMOKE_BASE_URL: "https://example.test/root/",
    LOAD_SMOKE_CONCURRENCY: "10",
    LOAD_SMOKE_PATH: "/api/health/live",
    LOAD_SMOKE_REQUESTS: "3",
  });

  assert.equal(options.concurrency, 3);
  assert.equal(options.method, "GET");
  assert.equal(options.requestCount, 3);
  assert.equal(options.timeoutMs, 5_000);
  assert.equal(options.url, "https://example.test/api/health/live");
});

test("load smoke latency summary reports stable percentiles", () => {
  assert.deepEqual(summarizeLatencies([]), {
    min: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    max: 0,
  });
  assert.deepEqual(summarizeLatencies([10, 5, 20, 15]), {
    min: 5,
    p50: 10,
    p95: 20,
    p99: 20,
    max: 20,
  });
});
