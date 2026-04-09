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

test("buildCollectionPiiRolloutReadinessReport points to the sensitive re-encryption helper when sensitive rewrites remain", () => {
  const report = buildCollectionPiiRolloutReadinessReport({
    encryptionConfigured: true,
    sensitiveFields: {
      fields: ["icNumber", "customerPhone", "accountNumber"],
      summary: {
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
      evaluation: {
        failures: ["rowsWithPlaintext=2 must be zero.", "rowsNeedingRewrite=2 must be zero."],
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
        plaintextFieldCounts: { customerName: 5, icNumber: 2, customerPhone: 1, accountNumber: 1 },
        plaintextFields: 9,
        processedRows: 10,
        redactableFieldCounts: { customerName: 5, icNumber: 0, customerPhone: 0, accountNumber: 0 },
        redactableFields: 5,
        rewriteFieldCounts: { customerName: 0, icNumber: 2, customerPhone: 1, accountNumber: 1 },
        rewriteFields: 4,
        rowsEligibleForRedaction: 5,
        rowsNeedingRewrite: 2,
        rowsWithPlaintext: 7,
      },
      evaluation: {
        failures: ["rowsWithPlaintext=7 must be zero.", "rowsNeedingRewrite=2 must be zero."],
        ok: false,
        requirements: {
          requireZeroPlaintext: true,
          requireZeroRedactable: true,
          requireZeroRewrite: true,
        },
      },
    },
  });

  assert.ok(
    report.recommendations.some((entry) => entry.includes("collection:reencrypt-sensitive-pii")),
  );
});

test("buildCollectionPiiRolloutReadinessReport blocks rollout on unreadable encrypted shadows", () => {
  const report = buildCollectionPiiRolloutReadinessReport({
    encryptionConfigured: true,
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
        unreadableShadowFieldCounts: { customerName: 0, icNumber: 1, customerPhone: 0, accountNumber: 0 },
        unreadableShadowFields: 1,
        rowsEligibleForRedaction: 0,
        rowsNeedingRewrite: 0,
        rowsWithUnreadableEncryptedShadow: 1,
        rowsWithPlaintext: 0,
      },
      evaluation: {
        failures: ["rowsWithUnreadableEncryptedShadow=1 must be zero."],
        ok: false,
        requirements: {
          requireZeroPlaintext: true,
          requireZeroRedactable: true,
          requireZeroRewrite: true,
          requireZeroUnreadableEncryptedShadow: true,
        },
      },
    },
    totalFields: {
      fields: ["customerName", "icNumber", "customerPhone", "accountNumber"],
      summary: {
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
      evaluation: {
        failures: ["rowsWithUnreadableEncryptedShadow=1 must be zero."],
        ok: false,
        requirements: {
          requireZeroPlaintext: true,
          requireZeroRedactable: true,
          requireZeroRewrite: true,
          requireZeroUnreadableEncryptedShadow: true,
        },
      },
    },
  });

  assert.ok(
    report.recommendations.some((entry) => entry.includes("unreadable encrypted shadows")),
  );
  assert.match(renderCollectionPiiRolloutReadinessReport(report), /rowsWithUnreadableEncryptedShadow=1/i);
});

test("buildCollectionPiiRolloutReadinessReport points to the configured retired-field helper when the env-scoped gate is still dirty", () => {
  const report = buildCollectionPiiRolloutReadinessReport({
    encryptionConfigured: true,
    retiredFields: new Set(["customerName", "icNumber"]),
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
        plaintextFieldCounts: { customerName: 2, icNumber: 1, customerPhone: 0, accountNumber: 0 },
        plaintextFields: 3,
        processedRows: 10,
        redactableFieldCounts: { customerName: 2, icNumber: 1, customerPhone: 0, accountNumber: 0 },
        redactableFields: 3,
        rewriteFieldCounts: { customerName: 0, icNumber: 0, customerPhone: 0, accountNumber: 0 },
        rewriteFields: 0,
        rowsEligibleForRedaction: 2,
        rowsNeedingRewrite: 0,
        rowsWithPlaintext: 2,
      },
      evaluation: {
        failures: ["rowsWithPlaintext=2 must be zero."],
        ok: false,
        requirements: {
          requireZeroPlaintext: true,
          requireZeroRedactable: true,
          requireZeroRewrite: true,
        },
      },
    },
  });

  assert.ok(
    report.recommendations.some((entry) => entry.includes("collection:retire-retired-fields-pii")),
  );
});
