import assert from "node:assert/strict";
import test from "node:test";
import {
  disposeCollectionReceiptDraftPreviewCache,
  fitCollectionReceiptPreviewDimensions,
  formatCollectionReceiptFileSize,
  pruneCollectionReceiptDraftPreviewCache,
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

test("pruneCollectionReceiptDraftPreviewCache revokes object URLs for inactive previews only", () => {
  const revokedUrls: string[] = [];
  const originalRevokeObjectURL = URL.revokeObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    revokedUrls.push(url);
  }) as typeof URL.revokeObjectURL;

  try {
    const previewCache = new Map([
      [
        "keep",
        {
          key: "keep",
          file: new File(["keep"], "keep.png", { type: "image/png" }),
          kind: "image" as const,
          url: "blob:keep-preview",
        },
      ],
      [
        "remove",
        {
          key: "remove",
          file: new File(["remove"], "remove.png", { type: "image/png" }),
          kind: "image" as const,
          url: "blob:remove-preview",
        },
      ],
    ]);

    pruneCollectionReceiptDraftPreviewCache(previewCache, new Set(["keep"]));

    assert.deepEqual(Array.from(previewCache.keys()), ["keep"]);
    assert.deepEqual(revokedUrls, ["blob:remove-preview"]);
  } finally {
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});

test("disposeCollectionReceiptDraftPreviewCache revokes every cached object URL and clears the cache", () => {
  const revokedUrls: string[] = [];
  const originalRevokeObjectURL = URL.revokeObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    revokedUrls.push(url);
  }) as typeof URL.revokeObjectURL;

  try {
    const previewCache = new Map([
      [
        "first",
        {
          key: "first",
          file: new File(["first"], "first.png", { type: "image/png" }),
          kind: "image" as const,
          url: "blob:first-preview",
        },
      ],
      [
        "second",
        {
          key: "second",
          file: new File(["second"], "second.pdf", { type: "application/pdf" }),
          kind: "pdf" as const,
          url: "blob:second-preview",
        },
      ],
    ]);

    disposeCollectionReceiptDraftPreviewCache(previewCache);

    assert.equal(previewCache.size, 0);
    assert.deepEqual(revokedUrls, ["blob:first-preview", "blob:second-preview"]);
  } finally {
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});
