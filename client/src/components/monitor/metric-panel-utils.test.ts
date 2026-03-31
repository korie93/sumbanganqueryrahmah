import assert from "node:assert/strict";
import test from "node:test";
import { buildSparklinePath, formatMetricValue } from "@/components/monitor/metric-panel-utils";

test("buildSparklinePath handles empty and single-point histories safely", () => {
  assert.equal(buildSparklinePath([], 140, 34), "");
  assert.equal(buildSparklinePath([5], 140, 34), "M 0 17 L 140 17");
});

test("buildSparklinePath returns a stable multi-point path", () => {
  const path = buildSparklinePath([1, 3, 2], 140, 34);
  assert.match(path, /^M 0\.00 34\.00 L 70\.00 0\.00 L 140\.00 17\.00$/);
});

test("formatMetricValue falls back for non-finite values", () => {
  assert.equal(formatMetricValue(12.345, 1), "12.3");
  assert.equal(formatMetricValue(Number.NaN, 2), "0");
});
