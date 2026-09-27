import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ViewerContentSummaryStrip } from "./ViewerContentSummaryStrip";

const fixture = {
  rowsCount: 150,
  totalRows: 181,
  pageStart: 1,
  pageEnd: 150,
  visibleHeadersCount: 3,
  headersCount: 8,
  selectedRowCount: 0,
};

test("Viewer summary uses wrapping definition pairs instead of large metric cards", () => {
  const markup = renderToStaticMarkup(createElement(ViewerContentSummaryStrip, fixture));
  assert.match(markup, /^<dl class="[^"]*flex flex-wrap/);
  assert.equal((markup.match(/<dt /g) || []).length, 3);
  assert.match(markup, />Page rows<\/dt><dd[^>]*>150<\/dd>/);
  assert.match(markup, /Rows 1-150 of 181/);
  assert.match(markup, />Visible columns<\/dt><dd[^>]*>3\/8/);
  assert.match(markup, />Selected rows<\/dt><dd[^>]*>0<\/dd>/);
  assert.match(markup, /<dd class="sr-only">No rows selected<\/dd>/);
  assert.doesNotMatch(markup, /ops-metric|ops-summary|role="group"|rounded|shadow/);
});

test("Viewer summary preserves export readiness and empty/header fallback values", () => {
  const selected = renderToStaticMarkup(createElement(ViewerContentSummaryStrip, { ...fixture, selectedRowCount: 9 }));
  assert.match(selected, />Selected rows<\/dt><dd[^>]*>9<\/dd>/);
  assert.match(selected, /<dd class="text-muted-foreground">Ready for focused export<\/dd>/);
  const empty = renderToStaticMarkup(createElement(ViewerContentSummaryStrip, { ...fixture, totalRows: 0, rowsCount: 0, headersCount: 0 }));
  assert.match(empty, /No rows loaded/);
  assert.match(empty, />Visible columns<\/dt><dd[^>]*>3\/3/);
});
