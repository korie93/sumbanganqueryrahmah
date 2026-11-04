import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GeneralSearchAdvancedControls } from "./GeneralSearchAdvancedControls";

function render(extra: Partial<ComponentProps<typeof GeneralSearchAdvancedControls>> = {}) {
  return renderToStaticMarkup(createElement(GeneralSearchAdvancedControls, {
    columns: [], filters: [{ id: "retained", field: "Amount", operator: "equals", value: "125" }],
    loading: false, loadingColumns: false, logic: "AND",
    onAddFilter() {}, onLogicChange() {}, onRemoveFilter() {}, onReset() {}, onSearch() {}, onUpdateFilter() {},
    ...extra,
  }));
}

test("column failure has an accessible recovery action while existing filter values remain", () => {
  const html = render({ columnsError: "Search fields could not be loaded. Please try again.", onRetryColumns() {} });
  assert.match(html, /role="alert"/);
  assert.match(html, /Retry fields/);
  assert.match(html, /value="125"/);
  assert.match(html, /aria-label="Filter 1 field"[^>]*disabled|disabled[^>]*aria-label="Filter 1 field"/);
});

test("retry loading is distinct from error and successful empty fields", () => {
  const busy = render({ loadingColumns: true });
  assert.match(busy, /Loading search fields/);
  assert.doesNotMatch(busy, /role="alert"/);
  const ready = render();
  assert.doesNotMatch(ready, /Retry fields|Loading search fields|role="alert"/);
});
