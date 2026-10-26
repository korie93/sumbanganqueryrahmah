import assert from "node:assert/strict";
import test from "node:test";
import { fitImagePreviewDimensions } from "./preview";
import { resolveReceiptImagePreviewProfile } from "./receipt-preview-image-policy";

test("mobile previews use smaller bounded images while desktop retains current detail", () => {
  for (const width of [320, 393, 767]) {
    const profile = resolveReceiptImagePreviewProfile(width);
    assert.equal(profile.compact, true);
    const size = fitImagePreviewDimensions(2_400, 3_600, profile);
    assert.ok(size.width * size.height <= 1_048_576);
    assert.ok(Math.max(size.width, size.height) <= 1_280);
  }
  for (const width of [768, 1_366, 1_920]) {
    const profile = resolveReceiptImagePreviewProfile(width);
    assert.deepEqual(profile, { compact: false, maxEdge: 1_600, maxPixels: 1_800_000 });
  }
});

test("invalid viewport sizes safely use the existing desktop limits", () => {
  for (const width of [NaN, Infinity, -1, 0]) {
    assert.deepEqual(resolveReceiptImagePreviewProfile(width), { compact: false, maxEdge: 1_600, maxPixels: 1_800_000 });
  }
});

test("detail promotion preserves aspect ratio and never enlarges small originals", () => {
  const compact = resolveReceiptImagePreviewProfile(393), detail = resolveReceiptImagePreviewProfile(1_366);
  const small = fitImagePreviewDimensions(200, 300, compact);
  assert.deepEqual(small, fitImagePreviewDimensions(200, 300, detail));
  for (const [width, height] of [[2_400, 3_600], [3_600, 1_200], [600, 12_000]] as const) {
    const low = fitImagePreviewDimensions(width, height, compact), high = fitImagePreviewDimensions(width, height, detail);
    assert.ok(high.width >= low.width && high.height >= low.height);
    assert.ok(Math.abs(high.width / high.height - width / height) < 0.01);
  }
});
