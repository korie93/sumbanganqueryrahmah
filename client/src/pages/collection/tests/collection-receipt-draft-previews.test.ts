import assert from "node:assert/strict";
import test from "node:test";
import {
  fitCollectionReceiptPreviewDimensions,
  formatCollectionReceiptFileSize,
} from "../useCollectionReceiptDraftPreviews";

test("fitCollectionReceiptPreviewDimensions scales large images down to the max edge", () => {
  assert.deepEqual(
    fitCollectionReceiptPreviewDimensions(4000, 3000, 320),
    { width: 320, height: 240 },
  );
});

test("fitCollectionReceiptPreviewDimensions keeps small images at original size", () => {
  assert.deepEqual(
    fitCollectionReceiptPreviewDimensions(240, 180, 320),
    { width: 240, height: 180 },
  );
});

test("formatCollectionReceiptFileSize keeps byte labels readable", () => {
  assert.equal(formatCollectionReceiptFileSize(512), "512 B");
  assert.equal(formatCollectionReceiptFileSize(2048), "2.0 KB");
});
