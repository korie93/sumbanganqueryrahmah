import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const exportSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection-records/export.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

test("collection record exports include Billing Principal OSP and coverage fields", () => {
  assert.match(exportSource, /"Card Number"/);
  assert.match(exportSource, /"Billing Principal \(OSP\)"/);
  assert.match(exportSource, /"TOTAL DUE"/);
  assert.match(exportSource, /"User Collection Amount"/);
  assert.match(exportSource, /"POOL \(External Payment Evidence\)"/);
  assert.match(exportSource, /"Settlement Total at Verification"/);
  assert.match(exportSource, /"CP Status"/);
  assert.match(exportSource, /"Match Accuracy"/);
  assert.match(exportSource, /record\.billingPrincipalOsp/);
  assert.match(exportSource, /record\.manualSettlement\?\.poolAmount/);
  assert.match(exportSource, /record\.manualSettlement\?\.effectiveTotal/);
  assert.match(exportSource, /getCollectionCardNumberLabel\(record\.cardNumber\)/);
});

test("collection Excel export neutralizes untrusted spreadsheet formula prefixes", () => {
  assert.match(exportSource, /SPREADSHEET_FORMULA_PREFIX/);
  assert.match(exportSource, /safeSpreadsheetText\(record\.customerName\)/);
  assert.match(exportSource, /safeSpreadsheetText\(record\.accountNumber\)/);
});

test("collection PDF wraps full Account and Card values instead of truncating them", () => {
  assert.match(exportSource, /record\.accountNumber \|\| "-"/);
  assert.match(exportSource, /getCollectionCardNumberLabel\(record\.cardNumber\)/);
  assert.match(exportSource, /pdf\.splitTextToSize/);
  assert.doesNotMatch(
    exportSource,
    /fitCollectionRecordText\(record\.accountNumber|fitCollectionRecordText\(getCollectionCardNumberLabel/,
  );
});
