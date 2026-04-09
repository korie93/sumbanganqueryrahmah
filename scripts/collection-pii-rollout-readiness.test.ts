import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollectionPiiRolloutReadinessReport,
  parseCliOptions,
  renderCollectionPiiRolloutReadinessReport,
} from "./collection-pii-rollout-readiness";

test("parseCliOptions accepts json and row caps for rollout readiness", () => {
  const options = parseCliOptions([
    "--batch-size",
    "250",
    "--max-rows",
    "1000",
    "--json",
  ]);

  assert.equal(options.batchSize, 250);
  assert.equal(options.maxRows, 1000);
  assert.equal(options.json, true);
});

test("buildCollectionPiiRolloutReadinessReport recommends the staged sensitive retirement helper when plaintext remains", () => {
  const report = buildCollectionPiiRolloutReadinessReport({
    encryptionConfigured: true,
    sensitiveFields: {
      fields: ["icNumber", "customerPhone", "accountNumber"],
      summary: {
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
      evaluation: {
        failures: ["rowsWithPlaintext=3 must be zero."],
        ok: false,
        requirements: {
          requireZeroPlaintext: true,
          requireZeroRedactable: true,
          requireZeroRewrite: true,
        },
      },
    },
    totalFields: {
      fields: ["customerName", "icNumber", "customerPhone", "accountNumber"],
      summary: {
        encryptionConfigured: true,
        plaintextFieldCounts: { customerName: 4, icNumber: 3, customerPhone: 2, accountNumber: 1 },
        plaintextFields: 10,
        processedRows: 10,
        redactableFieldCounts: { customerName: 4, icNumber: 3, customerPhone: 2, accountNumber: 1 },
        redactableFields: 10,
        rewriteFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
        rewriteFields: 0,
        rowsEligibleForRedaction: 5,
        rowsNeedingRewrite: 0,
        rowsWithPlaintext: 5,
      },
      evaluation: {
        failures: ["rowsWithPlaintext=5 must be zero."],
        ok: false,
        requirements: {
          requireZeroPlaintext: true,
          requireZeroRedactable: true,
          requireZeroRewrite: true,
        },
      },
    },
  });

  assert.equal(report.sensitiveRetirementReady, false);
  assert.equal(report.fullRetirementReady, false);
  assert.ok(
    report.recommendations.some((entry) => entry.includes("collection:retire-sensitive-pii")),
  );
  assert.match(renderCollectionPiiRolloutReadinessReport(report), /sensitive:/i);
});

test("buildCollectionPiiRolloutReadinessReport points to customerName as the next stage once sensitive fields are clean", () => {
  const report = buildCollectionPiiRolloutReadinessReport({
    encryptionConfigured: true,
    retiredFields: new Set(["icNumber", "customerPhone", "accountNumber"]),
    sensitiveFields: {
      fields: ["icNumber", "customerPhone", "accountNumber"],
      summary: {
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
      evaluation: {
        failures: [],
        ok: true,
        requirements: {
          requireZeroPlaintext: true,
          requireZeroRedactable: true,
          requireZeroRewrite: true,
        },
      },
    },
    totalFields: {
      fields: ["customerName", "icNumber", "customerPhone", "accountNumber"],
      summary: {
        encryptionConfigured: true,
        plaintextFieldCounts: { customerName: 5, icNumber: 0, customerPhone: 0, accountNumber: 0 },
        plaintextFields: 5,
        processedRows: 10,
        redactableFieldCounts: { customerName: 5, icNumber: 0, customerPhone: 0, accountNumber: 0 },
        redactableFields: 5,
        rewriteFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
        rewriteFields: 0,
        rowsEligibleForRedaction: 5,
        rowsNeedingRewrite: 0,
        rowsWithPlaintext: 5,
      },
      evaluation: {
        failures: ["rowsWithPlaintext=5 must be zero."],
        ok: false,
        requirements: {
          requireZeroPlaintext: true,
          requireZeroRedactable: true,
          requireZeroRewrite: true,
        },
      },
    },
  });

  assert.equal(report.sensitiveRetirementReady, true);
  assert.ok(
    report.recommendations.some((entry) => entry.includes("customerName retirement")),
  );
});
