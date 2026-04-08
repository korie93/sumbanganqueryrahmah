import fs from "node:fs/promises";
import path from "node:path";

function toMetricLine(label, metric) {
  return `| ${label} | ${metric.pct}% | ${metric.covered}/${metric.total} |`;
}

export function readCoverageSummary(source) {
  const total = source?.total;
  if (!total || typeof total !== "object") {
    throw new Error("Coverage summary is missing the top-level total block.");
  }

  const metrics = {
    lines: total.lines,
    statements: total.statements,
    branches: total.branches,
    functions: total.functions,
  };

  for (const [key, metric] of Object.entries(metrics)) {
    if (
      !metric
      || typeof metric.total !== "number"
      || typeof metric.covered !== "number"
      || typeof metric.pct !== "number"
    ) {
      throw new Error(`Coverage summary metric '${key}' is malformed.`);
    }
  }

  return metrics;
}

export function formatCoverageSummaryMarkdown(metrics) {
  return [
    "## Coverage Summary",
    "",
    "| Metric | Coverage | Covered/Total |",
    "| --- | ---: | ---: |",
    toMetricLine("Lines", metrics.lines),
    toMetricLine("Statements", metrics.statements),
    toMetricLine("Branches", metrics.branches),
    toMetricLine("Functions", metrics.functions),
    "",
  ].join("\n");
}

export async function loadCoverageSummaryFromFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  return readCoverageSummary(JSON.parse(raw));
}
