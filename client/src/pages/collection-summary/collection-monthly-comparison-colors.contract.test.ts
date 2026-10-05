import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readComparisonSource(fileName: string) {
  return readFileSync(
    path.resolve(process.cwd(), "client/src/pages/collection-summary", fileName),
    "utf8",
  );
}

function getProgressRule(source: string, modifier = "") {
  const selector = `.collection-monthly-comparison-progress${modifier}`;
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} must retain an explicit colour rule`);
  const end = source.indexOf("}", start);
  assert.ok(end > start, `${selector} must have a complete rule`);
  return source.slice(start, end + 1);
}

function getChartLine(source: string, dataKey: string) {
  const line = source.match(/<Line\s[\s\S]*?\/>/g)
    ?.find((entry) => entry.includes(`dataKey="${dataKey}"`));
  assert.ok(line, `Chart must retain the ${dataKey} series`);
  return line;
}

test("monthly comparison progress uses neutral references and keeps semantic status colours", () => {
  const css = readComparisonSource("CollectionMonthlyComparisonPanel.css");
  assert.match(getProgressRule(css), /--collection-monthly-comparison-progress-fill: hsl\(var\(--primary\)\)/);
  assert.match(getProgressRule(css, "--previous"), /--collection-monthly-comparison-progress-fill: hsl\(var\(--muted-foreground\)\)/);
  assert.match(getProgressRule(css, "--target"), /--collection-monthly-comparison-progress-fill: hsl\(var\(--foreground\)\)/);
  assert.doesNotMatch(getProgressRule(css, "--previous"), /destructive|warning|chart-/);
  assert.doesNotMatch(getProgressRule(css, "--target"), /destructive|warning|chart-/);
  assert.match(getProgressRule(css, "--danger"), /hsl\(var\(--destructive\)\)/);
  assert.match(getProgressRule(css, "--warning"), /hsl\(var\(--warning\)\)/);
});

test("same-day chart keeps current blue, neutral comparison lines, labels and distinct patterns", () => {
  const source = readComparisonSource("MonthlySameDayPaceChartParts.tsx");
  const current = getChartLine(source, "currentCumulative");
  const previous = getChartLine(source, "previousCumulative");
  const target = getChartLine(source, "targetExpected");

  assert.match(current, /stroke="hsl\(var\(--primary\)\)"/);
  assert.match(current, /name=\{pace.currentLabel\}/);
  assert.match(previous, /stroke="hsl\(var\(--muted-foreground\)\)"/);
  assert.match(previous, /name=\{pace.previousLabel\}/);
  assert.match(previous, /strokeDasharray="6 5"/);
  assert.match(target, /stroke="hsl\(var\(--foreground\)\)"/);
  assert.match(target, /name="Target pace"/);
  assert.match(target, /strokeDasharray="3 5"/);
  assert.doesNotMatch(previous + target, /--destructive|--warning|--chart-/);
});

test("monthly target chart line remains a neutral labelled reference with missing targets unconnected", () => {
  const source = readComparisonSource("MonthlyCollectionComparisonChartParts.tsx");
  const target = getChartLine(source, "monthlyTarget");
  assert.match(target, /stroke="hsl\(var\(--foreground\)\)"/);
  assert.match(target, /name="Monthly target"/);
  assert.match(target, /strokeDasharray="6 4"/);
  assert.match(target, /connectNulls=\{false\}/);
  assert.doesNotMatch(target, /--destructive|--warning/);
});

test("same-day progress references retain visible labels, amounts and accessible names", () => {
  const source = readComparisonSource("CollectionSameDayPaceSection.tsx");
  assert.match(source, /formatAmountRM\(pace.currentTotal\)/);
  assert.match(source, /formatAmountRM\(pace.previousTotal\)/);
  assert.match(source, /formatAmountRM\(pace.target.expectedByToday\)/);
  assert.match(source, /Expected range target pace/);
  assert.match(source, /aria-label="Expected same-day target pace"/);
  assert.match(source, /aria-label=\{`\$\{pace.currentLabel\} same-day total`\}/);
  assert.match(source, /aria-label=\{`\$\{pace.previousLabel\} same-day total`\}/);
});
