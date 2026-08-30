import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const exportSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection-records/export.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("collection record exports include Billing Principal OSP and coverage fields", () => {
  assert.match(exportSource, /"Billing Principal \(OSP\)"/);
  assert.match(exportSource, /"TOTAL DUE"/);
  assert.match(exportSource, /"CP Status"/);
  assert.match(exportSource, /"Match Accuracy"/);
  assert.match(exportSource, /record\.billingPrincipalOsp/);
});

test("collection Excel export neutralizes untrusted spreadsheet formula prefixes", () => {
  assert.match(exportSource, /SPREADSHEET_FORMULA_PREFIX/);
  assert.match(exportSource, /safeSpreadsheetText\(record\.customerName\)/);
  assert.match(exportSource, /safeSpreadsheetText\(record\.accountNumber\)/);
});
