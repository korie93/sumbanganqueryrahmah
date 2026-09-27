import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesheet = readFileSync(new URL("../dashboard-workspace.css", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

function declarationsFor(selector: string, property: string): string[] {
  return [...stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors!.split(",").some((value) => value.trim() === selector))
    .flatMap(([, , declarations]) => declarations!.split(";"))
    .map((declaration) => declaration.split(":"))
    .filter(([name]) => name?.trim() === property)
    .map(([, value]) => value!.replace(/\s+/g, ""));
}

test("dashboard review focus columns adapt to available width and enlarged text", () => {
  const columns = declarationsFor(".dashboard-review-focus", "grid-template-columns");

  assert.ok(columns.length > 0, "The review focus grid must define adaptive columns");
  for (const value of columns) {
    assert.equal(value, "repeat(auto-fit,minmax(min(100%,12rem),1fr))",
      "Every review focus grid rule must retain content-sized columns, including at breakpoints");
  }
});

test("dashboard review focus cells can shrink and wrap labels beside badges", () => {
  assert.deepEqual(declarationsFor(".dashboard-review-focus > div", "min-width"), ["0"]);
  assert.deepEqual(declarationsFor(".dashboard-review-focus > div", "flex-wrap"), ["wrap"]);
});
