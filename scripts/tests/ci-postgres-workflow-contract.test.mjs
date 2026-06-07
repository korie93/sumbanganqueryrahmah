import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
const RELEASE_WORKFLOW_PATH = ".github/workflows/release-verification.yml";
const POSTGRES_BOOTSTRAP_SCRIPT_PATH = "scripts/ci-start-postgres.sh";

function readText(path) {
  return readFileSync(path, "utf8");
}

test("CI workflows bootstrap local PostgreSQL instead of pulling Docker Hub service containers", () => {
  for (const workflowPath of [CI_WORKFLOW_PATH, RELEASE_WORKFLOW_PATH]) {
    const workflow = readText(workflowPath);

    assert.doesNotMatch(workflow, /image:\s*postgres:16/);
    assert.doesNotMatch(workflow, /services:\s*\n\s+postgres:/);
    assert.match(workflow, /name:\s*Start CI PostgreSQL/);
    assert.match(workflow, /bash scripts\/ci-start-postgres\.sh/);
  }
});

test("PostgreSQL bootstrap runs before CI steps that need a live database", () => {
  const ciWorkflow = readText(CI_WORKFLOW_PATH);
  const releaseWorkflow = readText(RELEASE_WORKFLOW_PATH);

  assert.ok(
    ciWorkflow.indexOf("Start CI PostgreSQL") < ciWorkflow.indexOf("Run DB bootstrap integration tests"),
    "CI smoke job must start PostgreSQL before DB integration tests",
  );
  assert.ok(
    releaseWorkflow.indexOf("Start CI PostgreSQL") < releaseWorkflow.indexOf("Run release readiness verification"),
    "release verification must start PostgreSQL before release readiness",
  );
});

test("PostgreSQL bootstrap script validates env and waits for authenticated readiness", () => {
  const script = readText(POSTGRES_BOOTSTRAP_SCRIPT_PATH);

  assert.match(script, /PG_USER:\?PG_USER is required/);
  assert.match(script, /PG_PASSWORD:\?PG_PASSWORD is required/);
  assert.match(script, /PG_DATABASE:\?PG_DATABASE is required/);
  assert.match(script, /ALTER USER postgres WITH PASSWORD/);
  assert.match(script, /createdb "\$\{PG_DATABASE\}"/);
  assert.match(script, /PGPASSWORD="\$\{PG_PASSWORD\}" pg_isready/);
  assert.doesNotMatch(script, /docker pull/i);
});
