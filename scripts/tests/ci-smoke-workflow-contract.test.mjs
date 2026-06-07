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
