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
  assert.equal(sections.length, 7);
  assert.deepEqual(sections.map((section) => section.title), [
    "Metadata",
    "Table A - System Result",
    "Table B - Client Result",
    "Latest Total Result Comparison",
    "Table A - Daily Movement",
    "System Calendar - TT OSP Basis",
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
  assert.equal(pages.length, 68);
});

test("daily visual report has each aging and TOTAL from canonical API values, not cumulative percentages", () => {
  const dataset = createBillingPrincipalVisualExportFixture();
  const section = buildBillingPrincipalVisualExportSections(dataset).find((item) => item.title === "System Calendar - Daily Aging Movement")!;
  assert.equal(section.headers.length, 11);
  assert.deepEqual(section.rows[0], ["2026-09-10", "+80.00%", "RM8,000.00", "+0.00%", "RM0.00", "+0.00%", "RM0.00", "+0.00%", "RM0.00", "+80.00%", "RM8,000.00"]);
  assert.equal(section.headers[1], "D3\nDaily movement %");
  assert.equal(isBillingPrincipalVisualNumericColumn(section, 0), false);
  assert.equal(isBillingPrincipalVisualNumericColumn(section, 1), true);
  assert.doesNotMatch(JSON.stringify(section), /Private|Client|7500|75\.00%/);
});

test("visual export includes authoritative TT OSP and exact-derived one-percent basis without widening daily rows", () => {
  const dataset = createBillingPrincipalVisualExportFixture();
  const acceptance = [
    ["1908183.36", "19081.8336", "RM1,908,183.36", "RM19,081.83"],
    ["1219740.60", "12197.4060", "RM1,219,740.60", "RM12,197.41"],
    ["1392703.35", "13927.0335", "RM1,392,703.35", "RM13,927.03"],
    ["1234657.25", "12346.5725", "RM1,234,657.25", "RM12,346.57"],
    ["5755284.56", "57552.8456", "RM5,755,284.56", "RM57,552.85"],
  ] as const;
  dataset.calendar[0]!.dailyMovement.rows = dataset.calendar[0]!.dailyMovement.rows.map((row, index) => ({
    ...row, totalOsp: acceptance[index]![0], ospRequiredForOnePercent: acceptance[index]![1], resultPercentage: "1.0000",
  }));
  dataset.calendar[0]!.dailyMovement.all = { ...dataset.calendar[0]!.dailyMovement.all,
    totalOsp: acceptance[4][0], ospRequiredForOnePercent: acceptance[4][1], resultPercentage: "1.0000" };
  const sections = buildBillingPrincipalVisualExportSections(dataset);
  const basis = sections.find((section) => section.title === "System Calendar - TT OSP Basis")!;
  assert.deepEqual(basis.headers, ["Aging", "TT OSP", "OSP for +1%"]);
  assert.deepEqual(basis.rows, acceptance.map((row, index) => [index === 4 ? "TOTAL (ALL)" : `D${index + 3}`, row[2], row[3]]));
  assert.equal(isBillingPrincipalVisualNumericColumn(basis, 0), false);
  assert.equal(isBillingPrincipalVisualNumericColumn(basis, 1), true);
  const daily = sections.find((section) => section.title === "System Calendar - Daily Aging Movement")!;
  assert.equal(daily.headers.length, 11);
  assert.equal(daily.rows[0]!.filter((cell) => cell === "+1.00%").length, 5);
  const metadata = JSON.stringify(sections[0]);
  assert.match(metadata, /Daily System closed \/ TT OSP/);
  assert.match(metadata, /percentage points/);
  assert.doesNotMatch(metadata, /closed \/ shared Target OSP|combined targets/);
});

test("visual daily values keep TT OSP movement distinct from target achievement and private results", () => {
  const dataset = createBillingPrincipalVisualExportFixture();
  const day = dataset.calendar[0]!;
  day.dailyMovement.rows[0] = { aging: "D3", totalOsp: "1000000.00", ospRequiredForOnePercent: "10000.0000",
    targetOsp: "300000.00", ospClosed: "10000.00", resultPercentage: "1.0000", closedAccountCount: 1 };
  day.dailyMovement.all = { ...day.dailyMovement.rows[0], aging: "ALL" };
  const sections = buildBillingPrincipalVisualExportSections(dataset);
  const daily = sections.find((section) => section.title === "System Calendar - Daily Aging Movement")!;
  assert.deepEqual(daily.rows[0]!.slice(0, 3), [day.date, "+1.00%", "RM10,000.00"]);
  assert.doesNotMatch(JSON.stringify(daily), /3\.33%|75\.00%/);
  assert.deepEqual(sections[1]!.rows[0]!.slice(1, 6), ["RM10,000.00", "50.00%", "RM5,000.00", "80.00%", "RM8,000.00"]);
  assert.deepEqual(sections[2]!.rows[0]!.slice(1, 6), ["RM10,000.00", "50.00%", "RM5,000.00", "75.00%", "RM7,500.00"]);
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

test("PNG download pacing waits between pages and honors cancellation before the next download", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let completed = false;
  const paced = yieldBillingPrincipalExport(undefined, 150).then(() => { completed = true; });
  t.mock.timers.tick(149);
  await Promise.resolve();
  assert.equal(completed, false);
  t.mock.timers.tick(1);
  await paced;
  assert.equal(completed, true);

  const controller = new AbortController();
  const cancelled = yieldBillingPrincipalExport(controller.signal, 150);
  const rejection = assert.rejects(cancelled, { name: "AbortError" });
  controller.abort();
  t.mock.timers.tick(150);
  await rejection;
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
