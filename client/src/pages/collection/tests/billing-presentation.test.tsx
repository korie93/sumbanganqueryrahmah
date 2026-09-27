import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingPrincipalClientResultTable } from "../BillingPrincipalSavedTargetWorkspace";
import { BillingPrincipalCalendarDayCard } from "../BillingPrincipalCalendarDayCard";
import { createBillingPrincipalVisualExportFixture } from "../billing-principal-v7-test-fixture";

function clientTable(editable: boolean, saving = false, exporting = false) {
  const fixture = createBillingPrincipalVisualExportFixture();
  return renderToStaticMarkup(createElement(BillingPrincipalClientResultTable, {
    target: fixture.overview.target, overview: { ok: true, ...fixture.overview },
    editable, saving, exporting, onSave: async () => {}, onDirtyChange: () => {},
  }));
}

test("private Billing table retains values and labelled percentage fields in a neutral dense surface", () => {
  const html = clientTable(true);
  assert.match(html, /aria-label="Table B Client Billing Principal result"/);
  assert.match(html, /aria-labelledby="billing-table-b-heading"/);
  assert.match(html, /\[&amp;_td\]:py-1\.5/);
  assert.match(html, /aria-label="D3 private target percentage"/);
  assert.match(html, /aria-label="D3 client result percentage"/);
  assert.match(html, /value="50\.0000"/);
  assert.match(html, /value="75\.0000"/);
  for (const value of ["RM10,000.00", "RM5,000.00", "RM7,500.00", "-RM2,500.00", "ALL"]) assert.ok(html.includes(value), value);
  assert.match(html, /h-11[^"]*md:h-9/);
  assert.doesNotMatch(html, /bg-chart-2|bg-status-online|bg-status-away|rounded-2xl/);
});

test("private Billing editing stays permission- and operation-gated", () => {
  const readOnly = clientTable(false);
  assert.doesNotMatch(readOnly, /<input|<button/);
  assert.match(readOnly, /75\.00%/);
  for (const [saving, exporting] of [[true, false], [false, true]]) {
    const html = clientTable(true, saving, exporting);
    const inputs = html.match(/<input[^>]*>/g) ?? [];
    assert.equal(inputs.length, 2);
    assert.ok(inputs.every((input) => input.includes('disabled=""')));
  }
});

test("Billing calendar keeps all daily and cumulative values without color-only state", () => {
  const day = createBillingPrincipalVisualExportFixture().calendar[0]!;
  const html = renderToStaticMarkup(createElement(BillingPrincipalCalendarDayCard, {
    day, asOf: day.date, selected: true, onSelect: () => {},
  }));
  assert.match(html, /aria-current="date"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /motion-reduce:transition-none/);
  for (const text of ["D3", "D4", "D5", "D6", "TOTAL", "Cumulative", "Balance", "System As Of", "+80.00%", "RM8,000.00"]) assert.ok(html.includes(text), text);
});

test("source metadata is disclosed without hiding validity warnings or changing selection guards", () => {
  const shell = readFileSync(new URL("../BillingPrincipalSavedTargetShell.tsx", import.meta.url), "utf8");
  const disclosure = shell.slice(shell.indexOf("<details"), shell.indexOf("</details>") + 10);
  assert.match(disclosure, /<summary[\s\S]*Source details/);
  assert.match(disclosure, /sourceSnapshots\.map/);
  assert.match(disclosure, /BillingPrincipalSavedTargetUpdatedAt/);
  assert.match(disclosure, /selectedTarget\.description/);
  assert.doesNotMatch(disclosure, /sourceValidityVerified/);
  assert.match(shell, /if \(!controlsLocked\) setSelectedTargetId\(event\.target\.value\)/);
  assert.match(shell, /disabled=\{controlsLocked\}/);
  assert.match(shell, /role === "superuser" && selectedTarget && !deleting/);
});
