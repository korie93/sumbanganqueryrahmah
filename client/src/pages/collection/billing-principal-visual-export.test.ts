import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBillingPrincipalVisualExportSections,
  buildBillingPrincipalVisualPages,
  isBillingPrincipalVisualNumericColumn,
  yieldBillingPrincipalExport,
  wrapBillingPrincipalVisualText,
} from "./billing-principal-visual-export";
import { createBillingPrincipalVisualExportFixture } from "./billing-principal-v7-test-fixture";

test("Billing OSP V3 visual export contains A/B balances and calendar without standalone account PII", () => {
  const sections = buildBillingPrincipalVisualExportSections(
    createBillingPrincipalVisualExportFixture(),
  );
  assert.equal(sections.length, 6);
  assert.deepEqual(sections.map((section) => section.title), [
    "Metadata",
    "Table A - System Result",
    "Table B - Client Result",
    "Latest Total Result Comparison",
    "Table A - Daily Movement",
    "System Calendar - Daily Aging Movement",
  ]);

  const visibleText = JSON.stringify(sections);
  assert.doesNotMatch(visibleText, /EVIDENCE-REF-1|4111111111119876|0000004321|Example Customer/);
  assert.match(visibleText, /Balance OSP/);
  assert.match(visibleText, /-RM3,000\.00/);
  assert.match(visibleText, /Assigned Admin/);
  assert.match(visibleText, /RM8,000\.00/);
  assert.match(visibleText, /2026-09-10/);
  assert.match(visibleText, /Saved masterlisting/);
  assert.match(visibleText, /masterlisting\.xlsb/);
  assert.doesNotMatch(visibleText, /Table C/);
  assert.doesNotMatch(visibleText, /Reconciled/);
  assert.equal(sections[1]?.headers.length, 8);
  assert.equal(sections[2]?.headers.length, 7);
  assert.equal(isBillingPrincipalVisualNumericColumn(sections[0]!, 1), false);
  assert.equal(isBillingPrincipalVisualNumericColumn(sections[1]!, 1), true);
  assert.equal(isBillingPrincipalVisualNumericColumn(sections[4]!, 1), false);
  assert.equal(isBillingPrincipalVisualNumericColumn(sections[4]!, 2), true);
});

test("visual export retains a complete 366-day calendar within its page bound", () => {
  const dataset = createBillingPrincipalVisualExportFixture();
  dataset.calendar = Array.from({ length: 366 }, (_, index) => ({ ...dataset.calendar[0]!, date: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10) }));
  const pages = buildBillingPrincipalVisualPages(dataset);
  assert.equal(pages.filter((page) => page.title.startsWith("Table A - Daily Movement")).flatMap((page) => page.rows).length, 366);
  assert.equal(pages.filter((page) => page.title.startsWith("System Calendar - Daily Aging Movement")).flatMap((page) => page.rows).length, 366);
  assert.equal(pages.length, 67);
});

test("daily visual report has each aging and TOTAL from canonical API values, not cumulative percentages", () => {
  const dataset = createBillingPrincipalVisualExportFixture();
  const section = buildBillingPrincipalVisualExportSections(dataset).find((item) => item.title === "System Calendar - Daily Aging Movement")!;
  assert.equal(section.headers.length, 11);
  assert.deepEqual(section.rows[0], ["2026-09-10", "160.00%", "RM8,000.00", "0.00%", "RM0.00", "0.00%", "RM0.00", "0.00%", "RM0.00", "160.00%", "RM8,000.00"]);
  assert.equal(isBillingPrincipalVisualNumericColumn(section, 0), false);
  assert.equal(isBillingPrincipalVisualNumericColumn(section, 1), true);
  assert.doesNotMatch(JSON.stringify(section), /Private|Client|7500|75\.00%/);
});

test("visual export describes current source validity instead of immutable revision dates", () => {
  const dataset = createBillingPrincipalVisualExportFixture();
  dataset.overview.revision.reportingWindow = { from: "2026-08-12", to: "2026-09-10", version: "live-v2", sourceValidityVerified: true,
    sources: [{ sourceImportId: "source-a", validFrom: "2026-08-12", validTo: "2026-09-10", configured: true }] };
  const sections = buildBillingPrincipalVisualExportSections(dataset);
  assert.deepEqual(sections[0]?.rows.find(([field]) => field === "Source validity"), ["Source validity", "2026-08-12 to 2026-09-10"]);
  assert.equal(sections[1]?.headers.length, 8);
  assert.equal(sections[2]?.headers.length, 7);
  assert.match(JSON.stringify(sections), /Target OSP minus closed OSP/);
});

test("visual rendering yields to UI cancellation between pages", async () => {
  const controller = new AbortController();
  const pending = yieldBillingPrincipalExport(controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(yieldBillingPrincipalExport(controller.signal), { name: "AbortError" });
  await yieldBillingPrincipalExport();
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
