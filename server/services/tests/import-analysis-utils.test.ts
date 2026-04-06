import assert from "node:assert/strict";
import test from "node:test";
import type { DataRow } from "../../../shared/schema-postgres";
import {
  consumeImportAnalysisRows,
  createImportAnalysisAccumulator,
  finalizeImportAnalysisAccumulator,
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
