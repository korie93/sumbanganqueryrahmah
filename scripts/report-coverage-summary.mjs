import fs from "node:fs/promises";
import path from "node:path";

import {
  formatCoverageSummaryMarkdown,
  loadCoverageSummaryFromFile,
} from "./lib/coverage-summary.mjs";

async function appendGitHubStepSummary(markdown) {
  const stepSummaryPath = String(process.env.GITHUB_STEP_SUMMARY || "").trim();
  if (!stepSummaryPath) {
    return false;
  }

  await fs.mkdir(path.dirname(stepSummaryPath), { recursive: true });
  await fs.appendFile(stepSummaryPath, `${markdown}\n`, "utf8");
  return true;
}

async function main() {
  const summaryPath = String(process.env.COVERAGE_SUMMARY_PATH || "coverage/coverage-summary.json").trim();
  const metrics = await loadCoverageSummaryFromFile(summaryPath);
  const markdown = formatCoverageSummaryMarkdown(metrics);
  const wroteStepSummary = await appendGitHubStepSummary(markdown);

  if (!wroteStepSummary) {
    process.stdout.write(`${markdown}\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to report coverage summary: ${message}`);
  process.exit(1);
});
