import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const panelPath = path.resolve(
  process.cwd(),
  "client/src/pages/collection/CollectionReceiptPanel.tsx",
);
const pendingGridPath = path.resolve(
  process.cwd(),
  "client/src/pages/collection/CollectionReceiptPendingGrid.tsx",
);

test("collection receipt panel keeps an explicit image-preview failure fallback", () => {
  const panelSource = readFileSync(panelPath, "utf8");
  const pendingGridSource = readFileSync(pendingGridPath, "utf8");

  assert.match(panelSource, /failedImagePreviewKeys/);
  assert.match(panelSource, /CollectionReceiptPendingGrid/);
  assert.match(pendingGridSource, /onError=\{\(\) => onMarkImagePreviewFailed\(preview\.key\)\}/);
  assert.match(pendingGridSource, /Receipt preview for/);
  assert.match(pendingGridSource, /Preview unavailable/);
});
