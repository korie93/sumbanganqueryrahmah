import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRetiredFieldCollectionPiiRetirementReport,
  parseCliOptions,
  renderRetiredFieldCollectionPiiRetirementReport,
  resolveConfiguredCollectionPiiRetiredFields,
} from "./retire-retired-collection-pii";

test("parseCliOptions accepts apply, json, and row caps for configured retirement", () => {
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

test("resolveConfiguredCollectionPiiRetiredFields requires a non-empty env value", () => {
  assert.throws(
    () => resolveConfiguredCollectionPiiRetiredFields(""),
    /COLLECTION_PII_RETIRED_FIELDS must be set/i,
  );
});

test("buildRetiredFieldCollectionPiiRetirementReport blocks apply mode when rewrites still remain", () => {
  const fields = new Set(["customerName", "icNumber"]);
  const report = buildRetiredFieldCollectionPiiRetirementReport({
    apply: true,
    before: {
      encryptionConfigured: true,
      plaintextFieldCounts: { customerName: 2, icNumber: 1, customerPhone: 0, accountNumber: 0 },
      plaintextFields: 3,
      processedRows: 10,
      redactableFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      redactableFields: 0,
      rewriteFieldCounts: { customerName: 2, icNumber: 1, customerPhone: 0, accountNumber: 0 },
      rewriteFields: 3,
      rowsEligibleForRedaction: 0,
      rowsNeedingRewrite: 2,
      rowsWithPlaintext: 2,
    },
    encryptionConfigured: true,
    fields,
    redaction: null,
  });

  assert.equal(report.ok, false);
  assert.ok(
    report.recommendations.some((entry) => entry.includes("collection:reencrypt-retired-fields")),
  );
});

test("buildRetiredFieldCollectionPiiRetirementReport blocks apply mode when unreadable encrypted shadows remain", () => {
  const fields = new Set(["customerName", "icNumber"]);
  const report = buildRetiredFieldCollectionPiiRetirementReport({
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
      unreadableShadowFieldCounts: { customerName: 1, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      unreadableShadowFields: 1,
      rowsEligibleForRedaction: 0,
      rowsNeedingRewrite: 0,
      rowsWithUnreadableEncryptedShadow: 1,
      rowsWithPlaintext: 0,
    },
    encryptionConfigured: true,
    fields,
    redaction: null,
  });

  assert.equal(report.ok, false);
  assert.ok(
    report.recommendations.some((entry) => entry.includes("unreadable encrypted shadows")),
  );
});

test("buildRetiredFieldCollectionPiiRetirementReport marks apply mode complete once configured slice is clean", () => {
  const fields = new Set(["customerName", "icNumber"]);
  const report = buildRetiredFieldCollectionPiiRetirementReport({
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
      plaintextFieldCounts: { customerName: 3, icNumber: 1, customerPhone: 0, accountNumber: 0 },
      plaintextFields: 4,
      processedRows: 10,
      redactableFieldCounts: { customerName: 3, icNumber: 1, customerPhone: 0, accountNumber: 0 },
      redactableFields: 4,
      rewriteFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
      rewriteFields: 0,
      rowsEligibleForRedaction: 3,
      rowsNeedingRewrite: 0,
      rowsWithPlaintext: 3,
    },
    encryptionConfigured: true,
    fields,
    redaction: {
      apply: true,
      batchSize: 500,
      candidateFieldCounts: { customerName: 3, icNumber: 1, customerPhone: 0, accountNumber: 0 },
      candidateFields: 4,
      candidateRows: 3,
      fields: ["customerName", "icNumber"],
      maxRows: null,
      mode: "apply",
      processedRows: 10,
      redactedFieldCounts: { customerName: 3, icNumber: 1, customerPhone: 0, accountNumber: 0 },
      redactedFields: 4,
      redactedRows: 3,
    },
  });

  assert.equal(report.ok, true);
  assert.ok(
    renderRetiredFieldCollectionPiiRetirementReport(report).includes("fields=customerName,icNumber"),
  );
  assert.ok(
    report.recommendations.some((entry) => entry.includes("collection:verify-pii-retired-fields")),
  );
});
