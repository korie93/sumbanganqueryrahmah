import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function extractSection(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  assert.notEqual(startIndex, -1, `missing section start: ${startMarker}`);
  const endIndex = source.indexOf(endMarker, startIndex);
  assert.notEqual(endIndex, -1, `missing section end: ${endMarker}`);
  return source.slice(startIndex, endIndex);
}

test("CI and release verification both seed the assigned admin required by Billing V3 smoke", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const release = readFileSync(".github/workflows/release-verification.yml", "utf8");
  for (const env of [
    extractSection(ci, "  smoke-ui:", "\n    steps:"),
    extractSection(release, "\nenv:", "\non:"),
  ]) {
    assert.match(env, /SEED_DEFAULT_USERS:\s*1/);
    assert.match(env, /SEED_ADMIN_USERNAME:\s*admin\$\{\{ github\.run_id \}\}\$\{\{ github\.run_attempt \}\}/);
    assert.match(env, /SEED_ADMIN_PASSWORD:\s*sqr-ci-admin-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-password-32chars/);
    assert.match(env, /SEED_ADMIN_FULL_NAME:\s*CI Assigned Admin/);
  }
});

test("smoke-ui workflow configures a deterministic receipt scanner shim for readiness", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const smokeJob = extractSection(workflow, "  smoke-ui:", "\n    steps:");

  assert.match(smokeJob, /COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED:\s*1/);
  assert.match(smokeJob, /COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND:\s*node/);
  assert.match(
    smokeJob,
    /COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON:\s*'\["-e","process\.exit\(0\)","\{file\}"\]'/,
  );
  assert.match(smokeJob, /COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED:\s*1/);
  assert.match(smokeJob, /COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS:\s*5000/);
  assert.match(smokeJob, /production templates still require clamdscan fail-closed/);
});

test("smoke-ui workflow configures a dedicated per-run collection PII key", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const smokeJob = extractSection(workflow, "  smoke-ui:", "\n    steps:");

  assert.match(
    smokeJob,
    /COLLECTION_PII_ENCRYPTION_KEY:\s*sqr-ci-collection-pii-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-ephemeral-key-48chars/,
  );
  assert.doesNotMatch(
    smokeJob,
    /COLLECTION_PII_ENCRYPTION_KEY:\s*sqr-ci-session-/,
    "Collection PII encryption must not reuse the session secret",
  );
});

test("smoke-ui workflow keeps auth smoke ahead of slower Lighthouse budgets", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const startIndex = workflow.indexOf("  smoke-ui:");
  assert.notEqual(startIndex, -1, "missing smoke-ui job");
  const smokeJob = workflow.slice(startIndex);

  assert.match(smokeJob, /timeout-minutes:\s*55/);
  assert.ok(
    smokeJob.indexOf("Run UI smoke") < smokeJob.indexOf("Run PageSpeed Lighthouse budgets"),
    "UI smoke should fail fast before slower PageSpeed budgets consume the job timeout",
  );
  assert.ok(
    smokeJob.indexOf("Run accessibility contracts") < smokeJob.indexOf("Run UI smoke"),
    "UI smoke should still run after visual and accessibility contracts",
  );
});

test("smoke-ui workflow isolates UI smoke from prior browser rate-limit windows", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const accessibilityIndex = workflow.indexOf("      - name: Run accessibility contracts");
  const cooldownIndex = workflow.indexOf(
    "Waiting for the shared adaptive rate-limit window to reset before UI smoke.",
  );
  const smokeAttemptIndex = workflow.indexOf("          run_smoke_attempt 1");

  assert.notEqual(accessibilityIndex, -1);
  assert.notEqual(cooldownIndex, -1);
  assert.notEqual(smokeAttemptIndex, -1);
  assert.ok(accessibilityIndex < cooldownIndex);
  assert.ok(cooldownIndex < smokeAttemptIndex);
  assert.match(workflow.slice(cooldownIndex, smokeAttemptIndex), /sleep 12/);
});

test("smoke-ui workflow retries only timeouts and preserves per-attempt artifacts", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const smokeStep = extractSection(
    workflow,
    "      - name: Run UI smoke",
    "\n      - name: Capture smoke monitoring snapshot",
  );

  assert.match(workflow, /SMOKE_TOTAL_TIMEOUT_MS:\s*480000/);
  assert.match(workflow, /SMOKE_CLEANUP_TIMEOUT_MS:\s*15000/);
  assert.match(smokeStep, /timeout --signal=TERM --kill-after=30s 9m/);
  assert.match(smokeStep, /SMOKE_ARTIFACTS_DIR="artifacts\/smoke-ui\/attempt-\$\{attempt\}"/);
  assert.match(smokeStep, /if \[ "\$smoke_status" -eq 124 \]; then/);
  assert.match(smokeStep, /run_smoke_attempt 2/);
  assert.doesNotMatch(smokeStep, /if \[ "\$smoke_status" -ne 0 \]; then/);
});
