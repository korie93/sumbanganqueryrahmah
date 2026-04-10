import assert from "node:assert/strict";
import test from "node:test";
import {
  COLLECTION_PII_ROLLOUT_CONTRACT_REQUIREMENTS,
  formatCollectionPiiRolloutContractReport,
  validateCollectionPiiRolloutContract,
} from "../lib/collection-pii-rollout-contract.mjs";

function buildCompliantFilesByPath() {
  return Object.fromEntries(
    COLLECTION_PII_ROLLOUT_CONTRACT_REQUIREMENTS.map((requirement) => [
      requirement.filePath,
      requirement.checks.map((check) => check.snippet).join("\n"),
    ]),
  );
}

test("collection PII rollout contract validation accepts repositories that preserve all rollout markers", () => {
  const validation = validateCollectionPiiRolloutContract({
    filesByPath: buildCompliantFilesByPath(),
  });

  assert.deepEqual(validation.failures, []);
  assert.equal(validation.summary.fileCount, COLLECTION_PII_ROLLOUT_CONTRACT_REQUIREMENTS.length);
  assert.equal(
    validation.summary.snippetCount,
    COLLECTION_PII_ROLLOUT_CONTRACT_REQUIREMENTS.reduce((total, requirement) => total + requirement.checks.length, 0),
  );
});

test("collection PII rollout contract validation flags missing required files", () => {
  const filesByPath = buildCompliantFilesByPath();
  delete filesByPath["server/internal/server-startup.ts"];

  const validation = validateCollectionPiiRolloutContract({ filesByPath });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /server\/internal\/server-startup\.ts/i);
});

test("collection PII rollout contract validation reports missing rollout markers clearly", () => {
  const filesByPath = buildCompliantFilesByPath();
  filesByPath["scripts/release-readiness-local.mjs"] = [
    "[\"run\", \"collection:pii-status\", \"--\", \"--json\"]",
    "[\"run\", \"collection:rollout-readiness\", \"--\", \"--json\"]",
    "await runNpm([\"run\", \"collection:verify-pii-sensitive-retirement\"], { env });",
    "await runNpm([\"run\", \"collection:verify-pii-retired-fields\"], { env });",
  ].join("\n");

  const validation = validateCollectionPiiRolloutContract({ filesByPath });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /full retirement gate/i);
});

test("collection PII rollout contract report summarizes successful checks", () => {
  const report = formatCollectionPiiRolloutContractReport({
    failures: [],
    summary: {
      fileCount: 10,
      checkedFileCount: 10,
      snippetCount: 20,
      checkedSnippetCount: 20,
    },
  });

  assert.match(report, /inspected 10 files and 20 rollout markers/i);
  assert.match(report, /protections, rollout helpers, and startup\/release guards/i);
});
