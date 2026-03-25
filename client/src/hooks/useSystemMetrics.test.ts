import assert from "node:assert/strict";
import test from "node:test";
import {
  combineOpenCircuitCount,
  resolveSystemMetricsPollIntervalMs,
  shouldPollSystemMetricsDetails,
} from "@/hooks/useSystemMetrics";

test("resolveSystemMetricsPollIntervalMs slows polling for hidden and low-spec contexts", () => {
  assert.equal(
    resolveSystemMetricsPollIntervalMs({ hidden: false, lowSpec: false }),
    5000,
  );
  assert.equal(
    resolveSystemMetricsPollIntervalMs({ hidden: false, lowSpec: true }),
    10000,
  );
  assert.equal(
    resolveSystemMetricsPollIntervalMs({ hidden: true, lowSpec: false }),
    15000,
  );
  assert.equal(
    resolveSystemMetricsPollIntervalMs({ hidden: true, lowSpec: true }),
    30000,
  );
});

test("shouldPollSystemMetricsDetails forces the first and periodic detailed refreshes", () => {
  assert.equal(
    shouldPollSystemMetricsDetails({ pollCount: 0 }),
    true,
  );
  assert.equal(
    shouldPollSystemMetricsDetails({ pollCount: 1 }),
    false,
  );
  assert.equal(
    shouldPollSystemMetricsDetails({ pollCount: 3 }),
    true,
  );
  assert.equal(
    shouldPollSystemMetricsDetails({ pollCount: 2, forceDetailed: true }),
    true,
  );
});

test("combineOpenCircuitCount allows the metric to return to zero instead of keeping stale values", () => {
  assert.equal(
    combineOpenCircuitCount({
      localCount: 0,
      clusterCount: 0,
      previous: 4,
    }),
    0,
  );
  assert.equal(
    combineOpenCircuitCount({
      localCount: 2,
      clusterCount: 3,
      previous: 0,
    }),
    5,
  );
});
