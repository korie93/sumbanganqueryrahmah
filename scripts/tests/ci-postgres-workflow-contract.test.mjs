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
  const ciPostgresIndex = ciWorkflow.indexOf("Start CI PostgreSQL");
  const ciMigrationIndex = ciWorkflow.indexOf("Apply database migrations");
  const ciIntegrationIndex = ciWorkflow.indexOf("Run DB bootstrap integration tests");
  const ciServerIndex = ciWorkflow.indexOf("Start built server");
  const releasePostgresIndex = releaseWorkflow.indexOf("Start CI PostgreSQL");
  const releaseMigrationIndex = releaseWorkflow.indexOf("Apply database migrations");
  const releaseReadinessIndex = releaseWorkflow.indexOf("Run release readiness verification");

  for (const [label, index] of [
    ["CI PostgreSQL bootstrap", ciPostgresIndex],
    ["CI database migration", ciMigrationIndex],
    ["CI DB integration tests", ciIntegrationIndex],
    ["CI built server", ciServerIndex],
    ["release PostgreSQL bootstrap", releasePostgresIndex],
    ["release database migration", releaseMigrationIndex],
    ["release readiness", releaseReadinessIndex],
  ]) {
    assert.notEqual(index, -1, `${label} step must be present`);
  }

  assert.ok(ciPostgresIndex < ciMigrationIndex, "CI must start PostgreSQL before migrations");
  assert.ok(ciMigrationIndex < ciIntegrationIndex, "CI must migrate before DB integration tests");
  assert.ok(ciMigrationIndex < ciServerIndex, "CI must migrate before starting the browser-test server");
  assert.ok(
    releasePostgresIndex < releaseMigrationIndex,
    "release verification must start PostgreSQL before migrations",
  );
  assert.ok(
    releaseMigrationIndex < releaseReadinessIndex,
    "release verification must migrate before release readiness",
  );

  assert.match(ciWorkflow, /name:\s*Apply database migrations\s+run:\s*npm run db:migrate/);
  assert.match(releaseWorkflow, /name:\s*Apply database migrations\s+run:\s*npm run db:migrate/);
});

test("CI build job runs every backend regression suite", () => {
  const ciWorkflow = readText(CI_WORKFLOW_PATH);
  const suiteSteps = [
    "Run auth tests",
    "Run http tests",
    "Run services tests",
    "Run repositories tests",
    "Run routes tests",
    "Run WebSocket tests",
    "Run intelligence tests",
  ];
  const buildIndex = ciWorkflow.indexOf("name: Build");

  assert.notEqual(buildIndex, -1);
  for (const stepName of suiteSteps) {
    const stepIndex = ciWorkflow.indexOf(`name: ${stepName}`);

    assert.notEqual(stepIndex, -1, `${stepName} must be present in CI`);
    assert.ok(stepIndex < buildIndex, `${stepName} must run before the build`);
  }
});

test("CI auth suite runs before HTTP and route coverage", () => {
  const ciWorkflow = readText(CI_WORKFLOW_PATH);

  assert.ok(ciWorkflow.indexOf("Run auth tests") < ciWorkflow.indexOf("Run http tests"));
  assert.ok(ciWorkflow.indexOf("Run auth tests") < ciWorkflow.indexOf("Run routes tests"));
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
