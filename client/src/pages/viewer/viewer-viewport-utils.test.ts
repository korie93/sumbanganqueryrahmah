import assert from "node:assert/strict";
import test from "node:test";
import { getViewerViewportHeight } from "./viewer-viewport-utils";

test("viewer viewport grows with workspace height while retaining useful bounds", () => {
  assert.equal(getViewerViewportHeight(1024), 694);
  assert.equal(getViewerViewportHeight(768), 438);
  assert.equal(getViewerViewportHeight(400), 240);
  assert.equal(getViewerViewportHeight(2000), 960);
  assert.equal(getViewerViewportHeight(Number.NaN), 570);
});
