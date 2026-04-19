import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const panelPath = path.resolve(
  process.cwd(),
  "client/src/pages/collection/CollectionReceiptPanel.tsx",
);

test("collection receipt panel keeps an explicit image-preview failure fallback", () => {
  const source = readFileSync(panelPath, "utf8");

  assert.match(source, /failedImagePreviewKeys/);
  assert.match(source, /onError=\{\(\) =>/);
  assert.match(source, /Preview unavailable/);
});
