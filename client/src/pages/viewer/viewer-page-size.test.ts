import assert from "node:assert/strict";
import test from "node:test";
import { getViewerPageSizeOptions, isViewerPageSizeChoice, resolveInitialViewerPageSize } from "./viewer-page-size";

test("card layout starts at 25 regardless of desktop configuration or device mode", () => {
  for (const size of [undefined, 10, 40, 100, 200, 500]) {
    for (const lowSpec of [false, true]) assert.equal(resolveInitialViewerPageSize(size, true, lowSpec), 25);
  }
});

test("desktop retains configured bounds and existing normal/low-spec defaults", () => {
  assert.equal(resolveInitialViewerPageSize(undefined, false, false), 100);
  assert.equal(resolveInitialViewerPageSize(undefined, false, true), 40);
  for (const size of [10, 40, 100, 200, 500]) assert.equal(resolveInitialViewerPageSize(size, false, true), size);
  assert.equal(resolveInitialViewerPageSize(100.8, false, false), 100);
  assert.equal(resolveInitialViewerPageSize(2, false, false), 10);
  assert.equal(resolveInitialViewerPageSize(501, false, false), 500);
  assert.equal(resolveInitialViewerPageSize(NaN, false, false), 100);
});

test("the page-size menu retains a custom desktop size without duplicate options", () => {
  assert.deepEqual(getViewerPageSizeOptions(25), [25, 50, 100]);
  assert.deepEqual(getViewerPageSizeOptions(40), [25, 40, 50, 100]);
  assert.deepEqual(getViewerPageSizeOptions(200), [25, 50, 100, 200]);
});

test("manual changes accept only the offered standard choices", () => {
  for (const size of [25, 50, 100]) assert.equal(isViewerPageSizeChoice(size), true);
  for (const size of [0, -25, 40, 200, 500, 25.5, NaN, Infinity]) assert.equal(isViewerPageSizeChoice(size), false);
});
