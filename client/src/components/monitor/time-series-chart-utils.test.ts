import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTimeSeriesChartAccessibilityContent,
  buildTimeSeriesChartData,
  formatTimeSeriesTooltipValue,
} from "@/components/monitor/time-series-chart-utils";

test("buildTimeSeriesChartData normalizes non-finite values", () => {
  assert.deepEqual(
    buildTimeSeriesChartData([
      { ts: 1, value: 42 },
      { ts: 2, value: Number.NaN },
    ]),
    [
      { t: 1, v: 42 },
      { t: 2, v: 0 },
    ],
  );
});

test("formatTimeSeriesTooltipValue keeps unit formatting stable", () => {
  assert.deepEqual(formatTimeSeriesTooltipValue(12.3456, "ms", "Latency"), ["12.35 ms", "Latency"]);
  assert.deepEqual(formatTimeSeriesTooltipValue(4, "", "Count"), ["4.00", "Count"]);
});

test("buildTimeSeriesChartAccessibilityContent summarizes normalized series data for screen readers", () => {
  const result = buildTimeSeriesChartAccessibilityContent([
    { ts: Date.UTC(2026, 3, 24, 10, 0, 0), value: 42 },
    { ts: Date.UTC(2026, 3, 24, 10, 5, 0), value: Number.NaN },
  ], "Latency", "ms");

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0]?.valueLabel, "42 ms");
  assert.equal(result.rows[1]?.valueLabel, "0 ms");
  assert.match(result.summary, /^Latency chart with 2 data points/i);
  assert.match(result.summary, /Latest 0 ms/i);
  assert.match(result.summary, /Minimum 0 ms/i);
  assert.match(result.summary, /Maximum 42 ms/i);
});

test("buildTimeSeriesChartAccessibilityContent reports empty chart data safely", () => {
  assert.deepEqual(
    buildTimeSeriesChartAccessibilityContent([], "Latency", "ms"),
    {
      rows: [],
      summary: "Latency chart. No data available.",
    },
  );
});
