import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingPrincipalCalendarDayCard } from "./BillingPrincipalCalendarDayCard";
import { createBillingPrincipalVisualExportFixture } from "./billing-principal-v7-test-fixture";

test("calendar card renders canonical daily aging and weighted total, separate from cumulative context", () => {
  const day = createBillingPrincipalVisualExportFixture().calendar[0]!;
  const html = renderToStaticMarkup(createElement(BillingPrincipalCalendarDayCard, { day, asOf: day.date, selected: true, onSelect() {} }));
  for (const text of ["D3", "D4", "D5", "D6", "TOTAL", "Daily result", "OSP closed", "160.00%", "80.00%", "Cumulative", "System As Of"]) assert.ok(html.includes(text), text);
  assert.match(html, /aria-current="date"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /type="button"/);
  assert.doesNotMatch(html, /Private|Client result/);
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
