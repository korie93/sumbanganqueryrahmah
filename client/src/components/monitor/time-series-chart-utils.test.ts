import assert from "node:assert/strict";
import test from "node:test";
import {
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
