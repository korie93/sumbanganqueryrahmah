import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSensitiveCollectionPiiRetirementReport,
  parseCliOptions,
  renderSensitiveCollectionPiiRetirementReport,
} from "./retire-sensitive-collection-pii";

test("parseCliOptions accepts apply, json, and row caps for sensitive retirement", () => {
  const options = parseCliOptions([
    "--apply",
    "--batch-size",
    "250",
    "--max-rows",
    "1000",
    "--json",
  ]);

  assert.equal(options.apply, true);
  assert.equal(options.batchSize, 250);
  assert.equal(options.maxRows, 1000);
  assert.equal(options.json, true);
});

test("buildSensitiveCollectionPiiRetirementReport blocks apply mode when rewrites still remain", () => {
  const report = buildSensitiveCollectionPiiRetirementReport({
    apply: true,
    before: {
      encryptionConfigured: true,
      plaintextFieldCounts: { customerName: 0, icNumber: 2, customerPhone: 1, accountNumber: 1 },
      plaintextFields: 4,
      processedRows: 10,
      redactableFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      redactableFields: 0,
      rewriteFieldCounts: { customerName: 0, icNumber: 2, customerPhone: 1, accountNumber: 1 },
      rewriteFields: 4,
      rowsEligibleForRedaction: 0,
      rowsNeedingRewrite: 2,
      rowsWithPlaintext: 2,
    },
    encryptionConfigured: true,
    redaction: null,
  });

  assert.equal(report.ok, false);
  assert.ok(
    report.recommendations.some((entry) => entry.includes("collection:reencrypt-sensitive-pii")),
  );
});

test("buildSensitiveCollectionPiiRetirementReport blocks apply mode when unreadable encrypted shadows remain", () => {
  const report = buildSensitiveCollectionPiiRetirementReport({
    apply: true,
    before: {
      encryptionConfigured: true,
      plaintextFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      plaintextFields: 0,
      processedRows: 10,
      redactableFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      redactableFields: 0,
      rewriteFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      rewriteFields: 0,
      unreadableShadowFieldCounts: { customerName: 0, icNumber: 1, customerPhone: 0, accountNumber: 0 },
      unreadableShadowFields: 1,
      rowsEligibleForRedaction: 0,
      rowsNeedingRewrite: 0,
      rowsWithUnreadableEncryptedShadow: 1,
      rowsWithPlaintext: 0,
    },
    encryptionConfigured: true,
    redaction: null,
  });

  assert.equal(report.ok, false);
  assert.ok(
    report.recommendations.some((entry) => entry.includes("unreadable encrypted shadows")),
  );
});

test("buildSensitiveCollectionPiiRetirementReport marks apply mode complete once post-redaction slice is clean", () => {
  const report = buildSensitiveCollectionPiiRetirementReport({
    after: {
      encryptionConfigured: true,
      plaintextFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      plaintextFields: 0,
      processedRows: 10,
      redactableFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      redactableFields: 0,
      rewriteFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      rewriteFields: 0,
      rowsEligibleForRedaction: 0,
      rowsNeedingRewrite: 0,
      rowsWithPlaintext: 0,
    },
    apply: true,
    before: {
      encryptionConfigured: true,
      plaintextFieldCounts: { customerName: 0, icNumber: 3, customerPhone: 2, accountNumber: 1 },
      plaintextFields: 6,
      processedRows: 10,
      redactableFieldCounts: { customerName: 0, icNumber: 3, customerPhone: 2, accountNumber: 1 },
      redactableFields: 6,
      rewriteFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      rewriteFields: 0,
      rowsEligibleForRedaction: 3,
      rowsNeedingRewrite: 0,
      rowsWithPlaintext: 3,
    },
    encryptionConfigured: true,
    redaction: {
      apply: true,
      batchSize: 500,
      candidateFieldCounts: { customerName: 0, icNumber: 3, customerPhone: 2, accountNumber: 1 },
      candidateFields: 6,
      candidateRows: 3,
      fields: ["icNumber", "customerPhone", "accountNumber"],
      maxRows: null,
      mode: "apply",
      processedRows: 10,
      redactedFieldCounts: { customerName: 0, icNumber: 3, customerPhone: 2, accountNumber: 1 },
      redactedFields: 6,
      redactedRows: 3,
    },
  });

  assert.equal(report.ok, true);
  assert.ok(
    renderSensitiveCollectionPiiRetirementReport(report).includes("after: rowsWithPlaintext=0"),
  );
  assert.ok(
    report.recommendations.some((entry) => entry.includes("COLLECTION_PII_RETIRED_FIELDS")),
  );
});
