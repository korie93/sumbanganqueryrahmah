import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GeneralSearchAdvancedControls } from "./GeneralSearchAdvancedControls";

function control(logic: "AND" | "OR") {
  return createElement(GeneralSearchAdvancedControls, {
    logic, loading: false, loadingColumns: false, columns: ["Name", "Amount"],
    filters: [1, 2, 3].map((id) => ({ id: String(id), field: "Amount", operator: "equals", value: "100" })),
    onAddFilter() {}, onLogicChange() {}, onRemoveFilter() {}, onReset() {}, onSearch() {}, onUpdateFilter() {},
  });
}

test("AND and OR expose their mutually exclusive pressed state", () => {
  for (const logic of ["AND", "OR"] as const) {
    const html = renderToStaticMarkup(control(logic));
    const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
    for (const name of ["AND", "OR"]) {
      const button = buttons.find((item) => item.includes(`data-testid="button-logic-${name.toLowerCase()}"`));
      assert.ok(button);
      assert.match(button, new RegExp(`aria-pressed="${logic === name}"`));
    }
  }
});

test("three filter rows have distinct field, operator and value names and per-instance IDs", () => {
  const html = renderToStaticMarkup(createElement("div", null, control("AND"), control("OR")));
  for (const row of [1, 2, 3]) for (const field of ["field", "operator", "value"]) {
    assert.equal((html.match(new RegExp(`aria-label="Filter ${row} ${field}"`, "g")) ?? []).length, 2);
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length);
});
