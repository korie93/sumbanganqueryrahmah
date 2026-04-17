import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const infoHintPath = path.join(rootDir, "client", "src", "components", "monitor", "InfoHint.tsx");
const metricPanelPath = path.join(rootDir, "client", "src", "components", "monitor", "MetricPanel.tsx");
const timeSeriesChartPath = path.join(rootDir, "client", "src", "components", "monitor", "TimeSeriesChart.tsx");

test("monitor icon-only helper controls avoid generic aria labels", async () => {
  const [infoHintSource, metricPanelSource, timeSeriesSource] = await Promise.all([
    fs.readFile(infoHintPath, "utf8"),
    fs.readFile(metricPanelPath, "utf8"),
    fs.readFile(timeSeriesChartPath, "utf8"),
  ]);

  assert.doesNotMatch(infoHintSource, /aria-label="Description"/);
  assert.match(metricPanelSource, /aria-label={`Show more information about \$\{label\}`}/);
  assert.match(timeSeriesSource, /aria-label={`Show more information about \$\{title\}`}/);
});
