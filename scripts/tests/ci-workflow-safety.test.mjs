import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ciWorkflowPath = path.resolve(process.cwd(), ".github/workflows/ci.yml");

test("CI workflow stops the built server without pkill", () => {
  const workflow = readFileSync(ciWorkflowPath, "utf8");

  assert.doesNotMatch(workflow, /\bpkill\b/);
  assert.match(workflow, /node scripts\/stop-background-server\.mjs server\.pid/);
});

test("CI workflow enforces client accessibility tests and bundle budgets", () => {
  const workflow = readFileSync(ciWorkflowPath, "utf8");

  assert.match(workflow, /Run client accessibility tests/);
  assert.match(workflow, /npm run test:client:a11y/);
  assert.match(workflow, /Verify client bundle budgets/);
  assert.match(workflow, /npm run verify:bundle-budgets/);
});

test("CI workflow pins Node.js to the reproducible runtime patch version", () => {
  const workflow = readFileSync(ciWorkflowPath, "utf8");

  assert.doesNotMatch(workflow, /node-version:\s*24(?:\s|$)/);
  assert.match(workflow, /node-version:\s*24\.12\.0/);
});

test("CI workflow keeps the Playwright smoke gate enabled", () => {
  const workflow = readFileSync(ciWorkflowPath, "utf8");

  assert.match(workflow, /Run UI smoke/);
  assert.match(workflow, /npm run smoke:ui/);
});
