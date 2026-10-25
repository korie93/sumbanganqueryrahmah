import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewerMobileCard } from "./ViewerMobileCard";
import { getViewerMobileCardPresentation, getViewerRowIdentity } from "./viewer-column-presentation";
import type { DataRowWithId } from "./types";

const row: DataRowWithId = {
  __rowId: 4, "Customer Name": "Demo Amina", Reference: "DEMO-0001",
  Account: "000012340000", Region: "Synthetic", Amount: "00175.50", Notes: "Line1\nLine2",
  "Other Name": "Demo Amina", Hidden: "Not selected",
};
const render = (headers: string[], values = row) => renderToStaticMarkup(createElement(ViewerMobileCard, {
  row: values, visibleHeaders: headers, selected: false, onToggleRowSelection: () => undefined,
  onInspectRow: () => undefined,
}));

test("compact mobile card represents identity once and never backfills its preview slot", () => {
  const headers = ["Customer Name", "Reference", "Account", "Region", "Amount", "Notes"];
  const before = JSON.stringify({ row, headers });
  const result = getViewerMobileCardPresentation(row, headers);
  assert.equal(result.identityHeader, "Customer Name");
  assert.equal(result.identity, "Demo Amina");
  assert.deepEqual(result.previewHeaders, ["Reference", "Account", "Region"]);
  assert.deepEqual(result.overflowHeaders, ["Amount", "Notes"]);
  assert.equal(result.shownFieldsCount, 4);
  assert.equal(JSON.stringify({ row, headers }), before);
  const markup = render(headers);
  assert.match(markup, /<span class="sr-only">Customer Name: <\/span>Demo Amina/);
  assert.doesNotMatch(markup, /<dt[^>]*>Customer Name<\/dt>/);
  assert.match(markup, /Row 5 · 4 fields shown/);
  assert.match(markup, /Show 2 more fields/);
  const detailsStart = markup.indexOf("<details");
  assert.ok(detailsStart >= 0);
  assert.doesNotMatch(markup.slice(detailsStart), /<dl|<dt|<dd|00175\.50|Line1/);
  assert.ok(markup.indexOf("000012340000") < detailsStart);
  assert.doesNotMatch(markup, /Not selected/);
});

test("wide rows defer all overflow field markup without changing the input data", () => {
  const headers = ["Customer Name", ...Array.from({ length: 42 }, (_, index) => `Field ${index + 1}`)];
  const values: DataRowWithId = { __rowId: 0, "Customer Name": "Synthetic Wide Row" };
  for (let index = 1; index <= 42; index++) values[`Field ${index}`] = `Value ${index}`;
  const before = JSON.stringify({ values, headers });
  const markup = render(headers, values);
  assert.match(markup, /Show 39 more fields/);
  assert.equal((markup.match(/<dt\b/g) ?? []).length, 3);
  assert.equal((markup.match(/<dd\b/g) ?? []).length, 3);
  assert.doesNotMatch(markup, /<dt[^>]*>Field (?:4|42)<\/dt>|Value 42/);
  assert.equal(JSON.stringify({ values, headers }), before);
});

test("identity outside the first four is represented by title and excluded from overflow counts", () => {
  const headers = ["Reference", "Account", "Region", "Amount", "Customer Name", "Notes"];
  const result = getViewerMobileCardPresentation(row, headers);
  assert.deepEqual(result.previewHeaders, headers.slice(0, 4));
  assert.deepEqual(result.overflowHeaders, ["Notes"]);
  assert.equal(result.shownFieldsCount, 5);
  const markup = render(headers);
  assert.match(markup, /Row 5 · 5 fields shown/);
  assert.match(markup, /aria-label="Viewer row 5,[^"]*5 fields shown"/);
  assert.match(markup, /Show 1 more field/);
  assert.doesNotMatch(markup, /<dt[^>]*>Customer Name<\/dt>/);
});

test("equal values in differently labelled fields are not deduplicated", () => {
  const headers = ["Customer Name", "Other Name", "Reference", "Account", "Notes"];
  const result = getViewerMobileCardPresentation(row, headers);
  assert.deepEqual(result.previewHeaders, ["Other Name", "Reference", "Account"]);
  assert.match(render(headers), /<dt[^>]*>Other Name<\/dt><dd[^>]*>Demo Amina<\/dd>/);
});

test("blank identities preserve fields and hidden names never become a heading", () => {
  for (const value of ["", "   ", null, undefined]) {
    const values = { ...row, "Customer Name": value };
    const result = getViewerMobileCardPresentation(values, ["Customer Name", "Reference", "Account", "Region", "Notes"]);
    assert.equal(result.identityHeader, undefined);
    assert.equal(result.identity, "Row 5");
    assert.deepEqual(result.previewHeaders, ["Customer Name", "Reference", "Account", "Region"]);
    assert.deepEqual(result.overflowHeaders, ["Notes"]);
  }
  const hiddenIdentity = getViewerMobileCardPresentation(row, ["Reference", "Account"]);
  assert.equal(hiddenIdentity.identity, "Row 5");
  assert.deepEqual(hiddenIdentity.previewHeaders, ["Reference", "Account"]);
  assert.doesNotMatch(render(["Reference", "Account"]), /Demo Amina|Customer Name/);
});

test("a real name matching fallback wording and zero-valued identities remain genuine fields", () => {
  for (const value of ["Row 5", "0", 0]) {
    const values = { ...row, "Customer Name": value };
    const result = getViewerMobileCardPresentation(values, ["Customer Name"]);
    assert.equal(result.identityHeader, "Customer Name");
    assert.equal(result.identity, String(value));
    assert.deepEqual(result.previewHeaders, []);
    assert.equal(result.shownFieldsCount, 1);
    const markup = render(["Customer Name"], values);
    assert.match(markup, /Row 5 · 1 field shown/);
    assert.doesNotMatch(markup, /<dl|<details/);
  }
});

test("compact title remains escaped and exact identifier values stay intact", () => {
  const values = { ...row, "Customer Name": '  <script>example</script>  ' };
  const markup = render(["Customer Name", "Reference", "Account", "Region", "Notes"], values);
  assert.match(markup, /&lt;script&gt;example&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script/);
  assert.match(markup, /000012340000/);
  assert.equal(getViewerRowIdentity(values, ["Customer Name"]), "<script>example</script>");
  assert.match(markup, /aria-label="Select row 5"/);
  assert.match(markup, /aria-label="View details for row 5"/);
  assert.match(markup, /aria-haspopup="dialog"/);
});

test("no selected fields retains fallback without adding inferred data or disclosures", () => {
  const result = getViewerMobileCardPresentation(row, []);
  assert.equal(result.identity, "Row 5");
  assert.equal(result.shownFieldsCount, 0);
  assert.deepEqual(result.previewHeaders, []);
  assert.deepEqual(result.overflowHeaders, []);
  const markup = render([]);
  assert.match(markup, /No visible columns selected/);
  assert.doesNotMatch(markup, /<dl|<details|Demo Amina|000012340000/);
});
