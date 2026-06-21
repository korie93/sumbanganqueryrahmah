import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  fitCollectionReceiptPreviewDimensions,
  formatCollectionReceiptFileSize,
} from "../useCollectionReceiptDraftPreviews";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionSourceDir = path.resolve(__dirname, "..");

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

test("collection receipt draft preview images reserve decoded thumbnail dimensions", () => {
  const cardSource = readFileSync(
    path.join(collectionSourceDir, "CollectionReceiptDraftCard.tsx"),
    "utf8",
  );
  const previewSource = readFileSync(
    path.join(collectionSourceDir, "useCollectionReceiptDraftPreviews.ts"),
    "utf8",
  );

  assert.match(previewSource, /width: thumbnail\.width/);
  assert.match(previewSource, /height: thumbnail\.height/);
  assert.match(cardSource, /width=\{hasPreviewDimensions \? preview\.width : undefined\}/);
  assert.match(cardSource, /height=\{hasPreviewDimensions \? preview\.height : undefined\}/);
  assert.match(cardSource, /aspectRatio: previewAspectRatio/);
  assert.match(cardSource, /decoding="async"/);
});

test("collection receipt draft preview creation falls back when thumbnail decoding fails", () => {
  const previewSource = readFileSync(
    path.join(collectionSourceDir, "useCollectionReceiptDraftPreviews.ts"),
    "utf8",
  );

  assert.match(previewSource, /try\s*\{\s*thumbnail = await createBitmapThumbnail\(file\);/s);
  assert.match(previewSource, /catch\s*\{\s*thumbnail = createEmptyCollectionReceiptDraftThumbnail\(\);/s);
});
