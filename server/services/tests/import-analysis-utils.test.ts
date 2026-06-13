import assert from "node:assert/strict";
import test from "node:test";
import type { DataRow } from "../../../shared/schema-postgres";
import {
  consumeImportAnalysisRows,
  createImportAnalysisAccumulator,
  createImportAnalysisDatasetScope,
  finalizeImportAnalysisAccumulator,
  finalizeImportAnalysisDatasetScope,
  IMPORT_ANALYSIS_MAX_TRACKED_UNIQUE_VALUES,
} from "../import-analysis-utils";

function buildRow(id: string, jsonDataJsonb: Record<string, unknown>): DataRow {
  return {
    id,
    importId: "import-1",
    jsonDataJsonb,
  };
}

test("import analysis utils classify valid Malaysian IC values by gender", () => {
  const accumulator = createImportAnalysisAccumulator();

  consumeImportAnalysisRows(accumulator, [
    buildRow("row-1", {
      citizenMale: "880101105531",
      citizenFemale: "880101105530",
    }),
  ]);

  const result = finalizeImportAnalysisAccumulator(accumulator);
  assert.equal(result.icLelaki.count, 1);
  assert.equal(result.icPerempuan.count, 1);
  assert.deepEqual(result.icLelaki.samples, ["880101105531"]);
  assert.deepEqual(result.icPerempuan.samples, ["880101105530"]);
});

test("import analysis utils keep duplicate counts while avoiding duplicate samples", () => {
  const accumulator = createImportAnalysisAccumulator();

  consumeImportAnalysisRows(accumulator, [
    buildRow("row-1", { identifier: "A1234567 A1234567" }),
    buildRow("row-2", { identifier: "A1234567" }),
  ]);

  const result = finalizeImportAnalysisAccumulator(accumulator);
  assert.equal(result.passportMY.count, 1);
  assert.equal(result.duplicates.count, 1);
  assert.deepEqual(result.duplicates.items[0], {
    value: "A1234567",
    count: 3,
  });
});

test("import analysis utils exclude vehicle-style columns from police detection", () => {
  const accumulator = createImportAnalysisAccumulator();

  consumeImportAnalysisRows(accumulator, [
    buildRow("row-1", {
      vehiclePlate: "RF12345",
      officerCode: "SW12345",
      militaryCode: "TT12345",
      foreignPassport: "Z1234567",
    }),
  ]);

  const result = finalizeImportAnalysisAccumulator(accumulator);
  assert.equal(result.noPolis.count, 1);
  assert.deepEqual(result.noPolis.samples, ["SW12345"]);
  assert.equal(result.noTentera.count, 1);
  assert.deepEqual(result.noTentera.samples, ["TT12345"]);
  assert.equal(result.passportLuarNegara.count, 1);
  assert.deepEqual(result.passportLuarNegara.samples, ["Z1234567"]);
});

test("import analysis utils profile missing values and mixed column types", () => {
  const accumulator = createImportAnalysisAccumulator();
  const scope = createImportAnalysisDatasetScope();
  const rows = [
    buildRow("row-1", { amount: "10", name: "Alice" }),
    buildRow("row-2", { amount: 20, name: "Bob" }),
    buildRow("row-3", { amount: "unknown", name: null }),
  ];

  consumeImportAnalysisRows(accumulator, rows, scope);
  finalizeImportAnalysisDatasetScope(accumulator, scope, rows.length);

  const result = finalizeImportAnalysisAccumulator(accumulator);
  const amount = result.columns.find((profile) => profile.name === "amount");
  const name = result.columns.find((profile) => profile.name === "name");

  assert.ok(amount);
  assert.equal(amount.inferredType, "mixed");
  assert.equal(amount.completenessPercent, 100);
  assert.equal(amount.typeConsistencyPercent, 66.67);
  assert.ok(name);
  assert.equal(name.emptyCount, 1);
  assert.equal(name.completenessPercent, 66.67);
  assert.equal(result.quality.profiledColumns, 2);
  assert.equal(result.quality.mixedTypeColumns, 1);
  assert.equal(result.quality.columnsWithMissingValues, 1);
  assert.equal(result.quality.score, 82);
});

test("import analysis column cardinality tracking remains bounded", () => {
  const accumulator = createImportAnalysisAccumulator();
  const scope = createImportAnalysisDatasetScope();
  const rows = Array.from(
    { length: IMPORT_ANALYSIS_MAX_TRACKED_UNIQUE_VALUES + 2 },
    (_, index) => buildRow(`row-${index}`, { reference: `value-${index}` }),
  );

  consumeImportAnalysisRows(accumulator, rows, scope);
  finalizeImportAnalysisDatasetScope(accumulator, scope, rows.length);

  const result = finalizeImportAnalysisAccumulator(accumulator);
  const reference = result.columns.find((profile) => profile.name === "reference");

  assert.ok(reference);
  assert.equal(reference.uniqueCount, IMPORT_ANALYSIS_MAX_TRACKED_UNIQUE_VALUES);
  assert.equal(reference.uniqueCountIsApproximate, true);
  assert.equal(result.quality.limitedCardinalityColumns, 1);
  assert.equal(result.quality.columnsNeedingReview, 0);
});

test("all-import profiling only counts rows where a column belongs to that dataset", () => {
  const accumulator = createImportAnalysisAccumulator();
  const firstScope = createImportAnalysisDatasetScope();
  const secondScope = createImportAnalysisDatasetScope();

  consumeImportAnalysisRows(accumulator, [
    buildRow("row-1", { firstOnly: "A" }),
    buildRow("row-2", { firstOnly: "B" }),
  ], firstScope);
  finalizeImportAnalysisDatasetScope(accumulator, firstScope, 2);

  consumeImportAnalysisRows(accumulator, [
    buildRow("row-3", { secondOnly: "C" }),
  ], secondScope);
  finalizeImportAnalysisDatasetScope(accumulator, secondScope, 1);

  const result = finalizeImportAnalysisAccumulator(accumulator);
  const firstOnly = result.columns.find((profile) => profile.name === "firstOnly");
  const secondOnly = result.columns.find((profile) => profile.name === "secondOnly");

  assert.equal(firstOnly?.applicableRows, 2);
  assert.equal(firstOnly?.emptyCount, 0);
  assert.equal(secondOnly?.applicableRows, 1);
  assert.equal(secondOnly?.emptyCount, 0);
});
