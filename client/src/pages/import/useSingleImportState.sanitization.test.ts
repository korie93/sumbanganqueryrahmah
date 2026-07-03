import assert from "node:assert/strict";
import test from "node:test";
import { prepareImportColumnMappingForSubmission } from "./useSingleImportState";

test("prepareImportColumnMappingForSubmission trims valid mapping fields", () => {
  const result = prepareImportColumnMappingForSubmission([
    { source: " Account No ", target: " account_number " },
    { source: " Customer Name ", target: null },
  ]);

  assert.equal(result.error, null);
  assert.deepEqual(result.columnMapping, [
    { source: "Account No", target: "account_number" },
    { source: "Customer Name", target: null },
  ]);
});

test("prepareImportColumnMappingForSubmission rejects duplicate included targets", () => {
  const result = prepareImportColumnMappingForSubmission([
    { source: "Account No", target: "account" },
    { source: "Alt Account No", target: " ACCOUNT " },
  ]);

  assert.equal(result.error, "Target field names must be unique.");
  assert.deepEqual(result.columnMapping, [
    { source: "Account No", target: "account" },
    { source: "Alt Account No", target: "ACCOUNT" },
  ]);
});

test("prepareImportColumnMappingForSubmission rejects prototype pollution field names", () => {
  assert.equal(
    prepareImportColumnMappingForSubmission([
      { source: "__proto__", target: "customer_name" },
    ]).error,
    "Column mapping contains an unsupported source column.",
  );

  assert.equal(
    prepareImportColumnMappingForSubmission([
      { source: "Customer Name", target: "constructor" },
    ]).error,
    "Column mapping contains an unsupported target field.",
  );
});

test("prepareImportColumnMappingForSubmission rejects malformed entries and overlong fields", () => {
  const overlongField = "x".repeat(129);

  assert.equal(
    prepareImportColumnMappingForSubmission([
      { source: "Customer Name" },
    ]).error,
    "Column mapping is invalid. Please review the selected columns.",
  );
  assert.equal(
    prepareImportColumnMappingForSubmission([
      { source: "Customer Name", target: overlongField },
    ]).error,
    "Column mapping contains an unsupported target field.",
  );
  assert.equal(
    prepareImportColumnMappingForSubmission(
      Array.from({ length: 257 }, (_, index) => ({
        source: `Column ${index}`,
        target: `field_${index}`,
      })),
    ).error,
    "Column mapping has too many columns. Please reduce the selected columns and try again.",
  );
});
