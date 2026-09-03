import assert from "node:assert/strict";
import test from "node:test";
import { buildBillingPrincipalVisualExportSections } from "./billing-principal-visual-export";
import { createBillingPrincipalVisualExportFixture } from "./billing-principal-v7-test-fixture";

test("Billing Principal visual export includes every governed V7 section and detail row", () => {
  const sections = buildBillingPrincipalVisualExportSections(
    createBillingPrincipalVisualExportFixture(),
  );
  assert.equal(sections.length, 14);
  assert.deepEqual(sections.map((section) => section.title), [
    "Metadata",
    "Table A - System Result",
    "Table B - Client Result",
    "Table C - Manual Reconciliation Summary",
    "Table C - Account Financial Detail",
    "Table C - Evidence and State",
    "Table C - Reference and Notes",
    "Table D - Reconciled Internal Result",
    "System vs Client vs Reconciled - Result",
    "System vs Client vs Reconciled - OSP",
    "Daily Movement",
    "Cumulative Calendar",
    "OSP Closed Drilldown - Financial",
    "OSP Closed Drilldown - Evidence",
  ]);

  const visibleText = JSON.stringify(sections);
  assert.match(visibleText, /EVIDENCE-REF-1/);
  assert.match(visibleText, /Verified missing prior payment/);
  assert.match(visibleText, /RM8,000\.00/);
  assert.match(visibleText, /2026-09-10/);
  assert.match(visibleText, /Saved masterlisting/);
  assert.match(visibleText, /masterlisting\.xlsb/);
  assert.doesNotMatch(visibleText, /reconciliation-internal-id/);
  assert.doesNotMatch(visibleText, /source-record-internal-id/);
});
