import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const PLAYWRIGHT_CACHE_ACTION_SHA = "0057852bfaa89a56745cba8c7296529d2fc39830";

function assertPlaywrightBrowserCache(workflowPath) {
  const workflow = readFileSync(workflowPath, "utf8");
  const cacheStepIndex = workflow.indexOf("Cache Playwright browsers");
  const installStepIndex = workflow.indexOf("Install Playwright Chromium");

  assert.ok(cacheStepIndex > 0, `${workflowPath} must cache Playwright browsers`);
  assert.ok(installStepIndex > cacheStepIndex, `${workflowPath} must restore cache before installing Chromium`);
  assert.match(workflow, new RegExp(`actions/cache@${PLAYWRIGHT_CACHE_ACTION_SHA}`));
  assert.match(workflow, /path:\s*~\/\.cache\/ms-playwright/);
  assert.match(workflow, /key:\s*\$\{\{\s*runner\.os\s*\}\}-playwright-\$\{\{\s*hashFiles\('package-lock\.json'\)\s*\}\}/);
  assert.match(workflow, /restore-keys:\s*\|\s*\n\s*\$\{\{\s*runner\.os\s*\}\}-playwright-/);
}

test("CI workflows cache Playwright browsers before installing Chromium", () => {
  assertPlaywrightBrowserCache(".github/workflows/ci.yml");
  assertPlaywrightBrowserCache(".github/workflows/release-verification.yml");
});
