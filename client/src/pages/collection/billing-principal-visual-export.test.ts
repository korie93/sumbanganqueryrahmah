import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBillingPrincipalVisualExportSections,
  wrapBillingPrincipalVisualText,
} from "./billing-principal-visual-export";
import { createBillingPrincipalVisualExportFixture } from "./billing-principal-v7-test-fixture";

test("Billing Principal visual export contains only the governed Table A, Table B, comparison and System details", () => {
  const sections = buildBillingPrincipalVisualExportSections(
    createBillingPrincipalVisualExportFixture(),
  );
  assert.equal(sections.length, 7);
  assert.deepEqual(sections.map((section) => section.title), [
    "Metadata",
    "Table A - System Result",
    "Table B - Client Result",
    "Latest Total Result Comparison",
    "Table A - Daily Movement",
    "Table A - OSP Closed Drilldown",
    "Table A - Drilldown Evidence",
  ]);

  const visibleText = JSON.stringify(sections);
  assert.match(visibleText, /EVIDENCE-REF-1/);
  assert.match(visibleText, /4111111111119876/);
  assert.match(visibleText, /RM8,000\.00/);
  assert.match(visibleText, /2026-09-10/);
  assert.match(visibleText, /Saved masterlisting/);
  assert.match(visibleText, /masterlisting\.xlsb/);
  assert.doesNotMatch(visibleText, /Table C/);
  assert.doesNotMatch(visibleText, /Reconciled/);
});

test("Billing Principal visual export wraps every character instead of clipping long evidence", () => {
  const value = "Reference panjang: BUKTI-12345 — kad 4111111111119876";
  const lines = wrapBillingPrincipalVisualText(
    value,
    8,
    (text) => Array.from(text).length,
  );

  assert.equal(lines.join(""), value);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => Array.from(line).length <= 8));
});
