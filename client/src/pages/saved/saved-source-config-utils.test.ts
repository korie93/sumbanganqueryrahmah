import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionSourceConfig } from "@/lib/api/collection-source-configs";
import {
  getSavedSourceCompatibilityMessage,
  getSavedSourceErrorMessage,
  isValidSavedSourceDate,
  savedSourceStatusPresentation,
  validateSavedSourceConfigInput,
} from "./saved-source-config-utils";

const incompatibleConfig: CollectionSourceConfig = {
  sourceImportId: "saved-source-id",
  sourceImportName: "Saved source",
  sourceFilename: "source.xlsb",
  rowCount: 10,
  validFrom: "2026-09-01",
  validTo: "2026-09-30",
  cycleKey: "2026-09",
  enabled: false,
  compatibilityStatus: "incompatible",
  compatibilityIssues: ["raw_internal_issue_marker"],
  indexedRowCount: 0,
  configuredBy: "operator",
  configuredAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  status: "incompatible",
};

test("Saved source dates require real ISO calendar dates and an ordered range", () => {
  assert.equal(isValidSavedSourceDate("2024-02-29"), true);
  assert.equal(isValidSavedSourceDate("2026-02-29"), false);
  assert.equal(isValidSavedSourceDate("2026-04-31"), false);
  assert.equal(isValidSavedSourceDate("01/09/2026"), false);
  assert.equal(validateSavedSourceConfigInput({
    validFrom: "2026-09-30",
    validTo: "2026-09-01",
    enabled: false,
  }), "Valid to cannot be earlier than valid from.");
  assert.equal(validateSavedSourceConfigInput({
    validFrom: "2026-09-01",
    validTo: "2026-09-30",
    enabled: true,
  }), null);
});

test("Saved source status presentation covers every server status", () => {
  assert.deepEqual(Object.keys(savedSourceStatusPresentation).sort(), [
    "active",
    "disabled",
    "expired",
    "incompatible",
    "upcoming",
  ]);
  assert.equal(savedSourceStatusPresentation.incompatible.label, "Needs review");
});

test("compatibility and error messages never echo raw issue or secret details", () => {
  const message = getSavedSourceCompatibilityMessage(incompatibleConfig);
  assert.doesNotMatch(message, /raw_internal_issue_marker/);
  assert.match(message, /required Collection fields/);

  const fallback = "Source configuration could not be saved.";
  assert.equal(getSavedSourceErrorMessage(
    new Error("500: {\"message\":\"JWT_SECRET=do-not-display\"}"),
    fallback,
  ), fallback);
});
