import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = process.cwd();

function readRepoFile(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("bundle budget script can emit a JSON report artifact", () => {
  const source = readRepoFile("scripts/verify-client-bundle-budgets.mjs");

  assert.match(source, /BUNDLE_BUDGET_REPORT_PATH/);
  assert.match(source, /writeBudgetReportIfRequested/);
  assert.match(source, /results: results\.map\(buildReportResult\)/);
});

test("bundle budget script keeps chart runtime outside the public entry graph", () => {
  const source = readRepoFile("scripts/verify-client-bundle-budgets.mjs");

  assert.match(source, /extractStaticJavaScriptDependencies/);
  assert.match(source, /inspectInitialModuleGraph/);
  assert.match(source, /recharts-\(\?:wrapper\|surface\|layer\|sector\)/);
  assert.match(source, /chart runtime must remain outside the public entry graph/);
});

test("CI uploads bundle budget reports after enforcing budgets", () => {
  const workflow = readRepoFile(".github/workflows/ci.yml");

  assert.match(workflow, /BUNDLE_BUDGET_REPORT_PATH=artifacts\/bundle\/bundle-budget-report\.json npm run verify:bundle-budgets/);
  assert.match(workflow, /name: Upload bundle budget artifact/);
  assert.match(workflow, /path: artifacts\/bundle/);
});

test("bundle size baseline documentation lists monitored heavy chunks", () => {
  const docs = readRepoFile("docs/BUNDLE_SIZES.md");

  for (const label of ["charts", "excel", "pdf", "capture", "collection-records"]) {
    assert.match(docs, new RegExp(`\\| ${label} \\|`));
  }
  assert.match(docs, /npm run verify:bundle-budgets/);
  assert.match(docs, /bundle-budget-report\.json/);
});
