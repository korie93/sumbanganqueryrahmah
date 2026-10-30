import assert from "node:assert/strict";
import test from "node:test";
import {
  compareImportFilterNumbers,
  getImportFilterValidationIssue,
  IMPORT_FILTER_NUMBER_MAX_LENGTH,
  isImportDataFilterActive,
  matchesImportNumericFilter,
  normalizeImportFilterNumber,
  type ImportDataColumnFilter,
} from "../../../../shared/common/import-data-filters";

test("numeric Viewer filters accept exact decimal and valid thousands-grouped values", () => {
  for (const [raw, expected] of [
    ["1,234.50", "1234.5"], ["-000.50", "-0.5"], ["+0010.000", "10"],
    [".50", "0.5"], ["1.", "1"], ["-0.00", "0"], ["\t 25.5\r\n", "25.5"],
  ]) assert.equal(normalizeImportFilterNumber(raw), expected);
  assert.equal(normalizeImportFilterNumber(25.5), "25.5");
  assert.equal(normalizeImportFilterNumber(1e-7), "0.0000001");
  assert.equal(normalizeImportFilterNumber(-1.25e-7), "-0.000000125");
  assert.equal(normalizeImportFilterNumber(1e21), "1000000000000000000000");
  assert.equal(normalizeImportFilterNumber("9".repeat(IMPORT_FILTER_NUMBER_MAX_LENGTH)), "9".repeat(256));
});

test("numeric Viewer filters reject empty, malformed, currency, exponent and hostile input", () => {
  for (const value of [null, undefined, false, {}, [], "", " ", "NaN", "Infinity", "-Infinity",
    "1e3", "0x10", "1,23", "1,234,56", "RM 100", "--1", "1.2.3", "1; DROP TABLE data_rows", "9".repeat(257),
    Number.NaN, Number.POSITIVE_INFINITY, Number.MIN_VALUE, 1e256,
  ]) assert.equal(normalizeImportFilterNumber(value), null, String(value));
});

test("numeric comparison preserves decimal precision and long imported identifiers", () => {
  for (const [a, b, expected] of [
    ["9", "100", -1], ["1000", "100", 1], ["1.10", "1.1", 0],
    ["-2", "-10", 1], ["-0.1", "0", -1], ["9007199254740993", "9007199254740992", 1],
    ["0.100000000000000000001", "0.1", 1], ["-0.100000000000000000001", "-0.1", -1],
  ] as const) {
    assert.equal(compareImportFilterNumbers(a, b), expected);
    assert.equal(compareImportFilterNumbers(b, a), expected === 0 ? 0 : -expected);
  }
  assert.equal(compareImportFilterNumbers("invalid", "1"), null);
  const tiny = `.${"0".repeat(254)}1`;
  assert.equal(tiny.length, 256);
  assert.equal(compareImportFilterNumbers(normalizeImportFilterNumber(tiny)!, "0"), 1);
});

test("greater/less are strict and Between includes both endpoints without treating missing values as zero", () => {
  const base: ImportDataColumnFilter = { column: "Amount", operator: "greaterThan", value: "100" };
  assert.equal(matchesImportNumericFilter("100", base), false);
  assert.equal(matchesImportNumericFilter("100.0001", base), true);
  assert.equal(matchesImportNumericFilter("100", { ...base, operator: "lessThan" }), false);
  assert.equal(matchesImportNumericFilter("99.99", { ...base, operator: "lessThan" }), true);
  const range: ImportDataColumnFilter = { ...base, operator: "between", value: "-1.50", valueTo: "1,000.50" };
  for (const value of ["-1.50", 0, "1,000.50"]) assert.equal(matchesImportNumericFilter(value, range), true);
  for (const value of ["-1.51", "1000.51", null, "", "N/A", false, {}]) assert.equal(matchesImportNumericFilter(value, range), false);
  assert.equal(matchesImportNumericFilter("5", { ...base, operator: "between", value: "5", valueTo: "5" }), true);
});

test("partial and invalid numeric drafts stay inactive until both ordered bounds are valid", () => {
  const filter: ImportDataColumnFilter = { column: "Amount", operator: "between", value: "100" };
  assert.equal(isImportDataFilterActive(filter), false);
  assert.match(getImportFilterValidationIssue(filter) ?? "", /both/);
  assert.equal(isImportDataFilterActive({ ...filter, valueTo: "99" }), false);
  assert.match(getImportFilterValidationIssue({ ...filter, valueTo: "99" }) ?? "", /Minimum/);
  assert.equal(isImportDataFilterActive({ ...filter, valueTo: "bad" }), false);
  assert.equal(isImportDataFilterActive({ ...filter, valueTo: "100" }), true);
  assert.equal(isImportDataFilterActive({ ...filter, column: " ", valueTo: "100" }), false);
  assert.equal(isImportDataFilterActive({ column: "Account No", operator: "equals", value: "00001", valueTo: "ignored" }), true);
});
