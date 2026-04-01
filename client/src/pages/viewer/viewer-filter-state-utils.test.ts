import assert from "node:assert/strict";
import test from "node:test";
import {
  appendViewerFilter,
  removeViewerFilterAt,
  updateViewerFilterAt,
} from "@/pages/viewer/viewer-filter-state-utils";

test("appendViewerFilter adds a default filter using the first header", () => {
  assert.deepEqual(appendViewerFilter([], ["name", "amount"]), [
    { column: "name", operator: "contains", value: "" },
  ]);
});

test("appendViewerFilter leaves filters unchanged when there are no headers", () => {
  const previous = [{ column: "name", operator: "contains", value: "ali" }] as const;
  assert.deepEqual(appendViewerFilter([...previous], []), previous);
});

test("updateViewerFilterAt and removeViewerFilterAt preserve immutable edits", () => {
  const previous = [
    { column: "name", operator: "contains", value: "ali" },
    { column: "amount", operator: "equals", value: "10" },
  ] as const;

  assert.deepEqual(updateViewerFilterAt([...previous], 1, "value", "20"), [
    { column: "name", operator: "contains", value: "ali" },
    { column: "amount", operator: "equals", value: "20" },
  ]);
  assert.deepEqual(removeViewerFilterAt([...previous], 0), [
    { column: "amount", operator: "equals", value: "10" },
  ]);
});
