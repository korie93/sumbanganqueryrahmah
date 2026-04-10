import assert from "node:assert/strict";
import test from "node:test";
import {
  COLLECTION_AMOUNT_CONTRACT_REQUIREMENTS,
  formatCollectionAmountContractReport,
  validateCollectionAmountContract,
} from "../lib/collection-amount-contract.mjs";

function buildCompliantFilesByPath() {
  return Object.fromEntries(
    COLLECTION_AMOUNT_CONTRACT_REQUIREMENTS.map((requirement) => [
      requirement.filePath,
      requirement.checks.map((check) => check.snippet).join("\n"),
    ]),
  );
}

test("collection amount contract validation accepts repositories that preserve every boundary marker", () => {
  const validation = validateCollectionAmountContract({
    filesByPath: buildCompliantFilesByPath(),
  });

  assert.deepEqual(validation.failures, []);
  assert.equal(validation.summary.fileCount, COLLECTION_AMOUNT_CONTRACT_REQUIREMENTS.length);
  assert.equal(
    validation.summary.snippetCount,
    COLLECTION_AMOUNT_CONTRACT_REQUIREMENTS.reduce((total, requirement) => total + requirement.checks.length, 0),
  );
});

test("collection amount contract validation flags missing required files", () => {
  const filesByPath = buildCompliantFilesByPath();
  delete filesByPath["shared/schema-postgres-collection.ts"];

  const validation = validateCollectionAmountContract({ filesByPath });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /shared\/schema-postgres-collection\.ts/);
});

test("collection amount contract validation flags missing boundary markers with a readable label", () => {
  const filesByPath = buildCompliantFilesByPath();
  filesByPath["server/repositories/backups-payload-utils.ts"] = [
    "receipt_total_amount as \"receiptTotalAmountCents\",",
    "receipt_amount as \"receiptAmountCents\",",
  ].join("\n");

  const validation = validateCollectionAmountContract({ filesByPath });

  assert.equal(validation.failures.length, 1);
  assert.match(validation.failures[0], /backup export keeps OCR amount field explicitly named in cents/i);
});

test("collection amount contract report summarizes successful checks", () => {
  const report = formatCollectionAmountContractReport({
    failures: [],
    summary: {
      fileCount: 8,
      checkedFileCount: 8,
      snippetCount: 10,
      checkedSnippetCount: 10,
    },
  });

  assert.match(report, /inspected 8 files and 10 contract markers/i);
  assert.match(report, /documented MYR vs cents split/i);
});
