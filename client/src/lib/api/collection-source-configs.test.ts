import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionSourceConfigDeleteResponseSchema,
  collectionSourceConfigMutationResponseSchema,
  collectionSourceConfigsResponseSchema,
} from "./collection-source-configs";

const validConfig = {
  sourceImportId: "saved-source-id",
  sourceImportName: "Saved source",
  sourceFilename: "source.xlsb",
  rowCount: 12,
  validFrom: "2026-09-01",
  validTo: "2026-09-30",
  cycleKey: "2026-09",
  enabled: true,
  compatibilityStatus: "compatible" as const,
  compatibilityIssues: [],
  indexedRowCount: 12,
  configuredBy: "operator",
  configuredAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  status: "active" as const,
};

test("Collection source config schemas accept bounded valid responses", () => {
  assert.equal(collectionSourceConfigsResponseSchema.safeParse({
    ok: true,
    sourceConfigs: [validConfig],
  }).success, true);
  assert.equal(collectionSourceConfigMutationResponseSchema.safeParse({
    ok: true,
    config: validConfig,
  }).success, true);
  assert.equal(collectionSourceConfigDeleteResponseSchema.safeParse({ ok: true }).success, true);
});

test("Collection source config schemas fail closed on unsafe numeric and enum shapes", () => {
  assert.equal(collectionSourceConfigsResponseSchema.safeParse({
    ok: true,
    sourceConfigs: [{ ...validConfig, indexedRowCount: -1 }],
  }).success, false);
  assert.equal(collectionSourceConfigsResponseSchema.safeParse({
    ok: true,
    sourceConfigs: [{ ...validConfig, status: "unknown" }],
  }).success, false);
  assert.equal(collectionSourceConfigMutationResponseSchema.safeParse({
    ok: true,
    config: { ...validConfig, validFrom: "01/09/2026" },
  }).success, false);
});
