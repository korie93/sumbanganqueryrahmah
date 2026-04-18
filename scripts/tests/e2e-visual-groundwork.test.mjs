import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readRepoFile(relativePath) {
  return readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

test("package scripts keep critical e2e and visual smoke commands wired", () => {
  const packageJson = readRepoFile("package.json");

  assert.match(packageJson, /"test:e2e:critical":\s*"node scripts\/ui-smoke\.mjs"/);
  assert.match(packageJson, /"test:visual:smoke":\s*"node scripts\/run-visual-smoke\.mjs"/);
});

test("ui smoke supports opt-in success-path visual captures", () => {
  const smokeScript = readRepoFile("scripts/ui-smoke.mjs");

  assert.match(smokeScript, /SMOKE_CAPTURE_VISUAL_BASELINES/);
  assert.match(smokeScript, /captureVisualSnapshot\(page, "login-page"\)/);
  assert.match(smokeScript, /captureVisualSnapshot\(page, "authenticated-home"\)/);
  assert.match(smokeScript, /captureVisualSnapshot\(page, "collection-daily"\)/);
});

test("README links the reviewed e2e, visual, and image guidance docs", () => {
  const readme = readRepoFile("README.md");

  assert.match(readme, /\[docs\/E2E_VISUAL_TESTING\.md\]\(\.\/docs\/E2E_VISUAL_TESTING\.md\)/);
  assert.match(readme, /\[docs\/IMAGE_OPTIMIZATION\.md\]\(\.\/docs\/IMAGE_OPTIMIZATION\.md\)/);
});
