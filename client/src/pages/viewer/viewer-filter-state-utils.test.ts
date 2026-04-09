import assert from "node:assert/strict";
import test from "node:test";
import {
  appendViewerFilter,
  removeViewerFilterAt,
  updateViewerFilterAt,
} from "@/pages/viewer/viewer-filter-state-utils";

test("appendViewerFilter adds a default filter using the first header", () => {
  const next = appendViewerFilter([], ["name", "amount"]);

  assert.equal(next.length, 1);
  assert.equal(next[0]?.column, "name");
  assert.equal(next[0]?.operator, "contains");
  assert.equal(next[0]?.value, "");
  assert.match(next[0]?.id || "", /^viewer-filter-\d+$/);
});

test("appendViewerFilter leaves filters unchanged when there are no headers", () => {
  const previous = [{ id: "viewer-filter-existing", column: "name", operator: "contains", value: "ali" }] as const;
  assert.deepEqual(appendViewerFilter([...previous], []), previous);
});

test("updateViewerFilterAt and removeViewerFilterAt preserve immutable edits", () => {
  const previous = [
    { id: "viewer-filter-1", column: "name", operator: "contains", value: "ali" },
    { id: "viewer-filter-2", column: "amount", operator: "equals", value: "10" },
  ] as const;

  assert.deepEqual(updateViewerFilterAt([...previous], 1, "value", "20"), [
    { id: "viewer-filter-1", column: "name", operator: "contains", value: "ali" },
    { id: "viewer-filter-2", column: "amount", operator: "equals", value: "20" },
  ]);
  assert.deepEqual(removeViewerFilterAt([...previous], 0), [
    { id: "viewer-filter-2", column: "amount", operator: "equals", value: "10" },
  ]);
});
