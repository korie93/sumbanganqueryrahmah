import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const releaseWorkflowPath = path.resolve(process.cwd(), ".github/workflows/release-verification.yml");

test("release verification workflow keeps the lightweight load-testing scaffold check enabled", () => {
  const workflow = readFileSync(releaseWorkflowPath, "utf8");

  assert.match(workflow, /Verify load-testing scaffold/);
  assert.match(workflow, /node --test scripts\/tests\/load-testing-contract\.test\.mjs/);
});

test("release verification workflow generates cryptographic per-run runtime secrets instead of deriving them from public metadata", () => {
  const workflow = readFileSync(releaseWorkflowPath, "utf8");

  assert.match(workflow, /Generate secure CI runtime secrets/);
  assert.match(workflow, /node scripts\/ci\/generate-runtime-secrets\.mjs/);
  assert.doesNotMatch(workflow, /SESSION_SECRET:\s*.*github\.run_id/i);
  assert.doesNotMatch(workflow, /TWO_FACTOR_ENCRYPTION_KEY:\s*.*github\.run_id/i);
  assert.doesNotMatch(workflow, /PG_PASSWORD:\s*.*github\.run_id/i);
  assert.doesNotMatch(workflow, /SEED_SUPERUSER_PASSWORD:\s*.*github\.run_id/i);
});

test("release verification workflow pins Node.js to the reproducible runtime patch version", () => {
  const workflow = readFileSync(releaseWorkflowPath, "utf8");

  assert.doesNotMatch(workflow, /node-version:\s*24(?:\s|$)/);
  assert.match(workflow, /node-version:\s*24\.12\.0/);
});
