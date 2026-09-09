import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingPrincipalCalendarDayCard } from "./BillingPrincipalCalendarDayCard";
import { createBillingPrincipalVisualExportFixture } from "./billing-principal-v7-test-fixture";
import { buildBillingPrincipalVisualExportSections } from "./billing-principal-visual-export";

test("calendar card renders canonical daily aging and weighted total, separate from cumulative context", () => {
  const day = createBillingPrincipalVisualExportFixture().calendar[0]!;
  const html = renderToStaticMarkup(createElement(BillingPrincipalCalendarDayCard, { day, asOf: day.date, selected: true, onSelect() {} }));
  for (const text of ["D3", "D4", "D5", "D6", "TOTAL", "Movement %", "OSP closed", "+80.00%", "80.00%", "Cumulative", "System As Of", "percentage points", "TT OSP"]) assert.ok(html.includes(text), text);
  assert.match(html, /aria-current="date"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /type="button"/);
  assert.doesNotMatch(html, /Private|Client result/);
  assert.doesNotMatch(html, /160\.00%/);
});

test("quiet days keep all four aging rows and zero values as accessible text", () => {
  const day = createBillingPrincipalVisualExportFixture().calendar[0]!;
  day.dailyMovement.rows = day.dailyMovement.rows.map((row) => ({ ...row, ospClosed: "0.00", resultPercentage: "0.0000", closedAccountCount: 0 }));
  day.dailyMovement.all = { ...day.dailyMovement.all, ospClosed: "0.00", resultPercentage: "0.0000", closedAccountCount: 0 };
  const html = renderToStaticMarkup(createElement(BillingPrincipalCalendarDayCard, { day, asOf: "2026-09-09", selected: false, onSelect() {} }));
  assert.match(html, /No movement/);
  assert.match(html, /0\.00%/);
  assert.match(html, /RM0\.00/);
  assert.doesNotMatch(html, /aria-current=/);
});

test("calendar card presents the canonical TT OSP percentage without substituting target progress", () => {
  const day = createBillingPrincipalVisualExportFixture().calendar[0]!;
  day.dailyMovement.rows[0] = { aging: "D3", totalOsp: "1000000.00", ospRequiredForOnePercent: "10000.0000",
    targetOsp: "300000.00", ospClosed: "10000.00", resultPercentage: "1.0000", closedAccountCount: 1 };
  day.dailyMovement.all = { ...day.dailyMovement.rows[0], aging: "ALL" };
  const html = renderToStaticMarkup(createElement(BillingPrincipalCalendarDayCard, { day, asOf: day.date, selected: false, onSelect() {} }));
  assert.match(html, /\+1\.00%/);
  assert.match(html, /RM10,000\.00/);
  assert.doesNotMatch(html, /3\.33%/);
});

test("calendar and PDF/image daily sections display identical canonical acceptance movements", () => {
  const dataset = createBillingPrincipalVisualExportFixture();
  const day = dataset.calendar[0]!;
  for (const [closed, percentage, display] of [["9540.92", "0.5000", "+0.50%"], ["19081.83", "1.0000", "+1.00%"],
    ["38163.67", "2.0000", "+2.00%"], ["95409.17", "5.0000", "+5.00%"], ["190818.34", "10.0000", "+10.00%"]]) {
    day.dailyMovement.rows[0] = { aging: "D3", totalOsp: "1908183.36", ospRequiredForOnePercent: "19081.8336",
      targetOsp: "572455.01", ospClosed: closed!, resultPercentage: percentage!, closedAccountCount: 1 };
    day.dailyMovement.all = { ...day.dailyMovement.rows[0], aging: "ALL" };
    const html = renderToStaticMarkup(createElement(BillingPrincipalCalendarDayCard, { day, asOf: day.date, selected: false, onSelect() {} }));
    const exported = buildBillingPrincipalVisualExportSections(dataset).find((section) => section.title === "System Calendar - Daily Aging Movement")!;
    assert.equal(exported.rows[0]![1], display);
    assert.ok(html.includes(exported.rows[0]![1]!));
    assert.ok(html.includes(exported.rows[0]![2]!));
  }
});
