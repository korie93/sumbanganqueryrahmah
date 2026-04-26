import assert from "node:assert/strict";
import test from "node:test";

import {
  RECEIPT_IMAGE_PREVIEW_MAX_EDGE,
  RECEIPT_IMAGE_PREVIEW_MAX_PIXELS,
  fitImagePreviewDimensions,
  optimizeImageBlobForPreview,
} from "./preview";

test("fitImagePreviewDimensions keeps preview canvases inside the default memory budget", () => {
  assert.deepEqual(
    fitImagePreviewDimensions(5_000, 4_000),
    { width: 2_048, height: 1_638 },
  );
  assert.deepEqual(
    fitImagePreviewDimensions(10_000, 10_000),
    { width: 2_048, height: 2_048 },
  );
});

test("fitImagePreviewDimensions respects tighter custom pixel caps for extreme aspect ratios", () => {
  assert.deepEqual(
    fitImagePreviewDimensions(12_000, 3_000, {
      maxEdge: 2_048,
      maxPixels: 1_000_000,
    }),
    { width: 2_000, height: 500 },
  );
  assert.deepEqual(
    fitImagePreviewDimensions(12_000, 400, {
      maxEdge: 2_048,
      maxPixels: 400_000,
    }),
    { width: 2_048, height: 68 },
  );
});

test("receipt image preview caps keep rendered receipts inside the UI memory budget", () => {
  assert.equal(RECEIPT_IMAGE_PREVIEW_MAX_EDGE, 1_200);
  assert.equal(RECEIPT_IMAGE_PREVIEW_MAX_PIXELS, 1_200_000);

  const dimensions = fitImagePreviewDimensions(5_000, 4_000, {
    maxEdge: RECEIPT_IMAGE_PREVIEW_MAX_EDGE,
    maxPixels: RECEIPT_IMAGE_PREVIEW_MAX_PIXELS,
  });

  assert.equal(Math.max(dimensions.width, dimensions.height) <= RECEIPT_IMAGE_PREVIEW_MAX_EDGE, true);
  assert.equal(dimensions.width * dimensions.height <= RECEIPT_IMAGE_PREVIEW_MAX_PIXELS, true);
});

test("fitImagePreviewDimensions returns a safe empty shape for invalid inputs", () => {
  assert.deepEqual(fitImagePreviewDimensions(0, 100), { width: 0, height: 0 });
  assert.deepEqual(fitImagePreviewDimensions(100, Number.NaN), { width: 0, height: 0 });
  assert.deepEqual(
    fitImagePreviewDimensions(100, 100, { maxEdge: 0 }),
    { width: 0, height: 0 },
  );
});

type PatchedPreviewGlobals = {
  createImageBitmap?: unknown;
  document?: unknown;
  Image?: unknown;
  urlCreateObjectUrl?: typeof URL.createObjectURL | undefined;
  urlRevokeObjectUrl?: typeof URL.revokeObjectURL | undefined;
};

async function withPatchedPreviewGlobals<T>(
  patches: PatchedPreviewGlobals,
  run: () => Promise<T>,
): Promise<T> {
  const target = globalThis;
  const globalRecord = globalThis as Record<string, unknown>;
  const originalCreateImageBitmap = target.createImageBitmap;
  const originalDocument = target.document;
  const originalImage = target.Image;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  try {
    globalRecord.createImageBitmap = patches.createImageBitmap;
    globalRecord.document = patches.document;
    globalRecord.Image = patches.Image;
    if (patches.urlCreateObjectUrl) {
      URL.createObjectURL = patches.urlCreateObjectUrl;
    }
    if (patches.urlRevokeObjectUrl) {
      URL.revokeObjectURL = patches.urlRevokeObjectUrl;
    }

    return await run();
  } finally {
    globalRecord.createImageBitmap = originalCreateImageBitmap;
    globalRecord.document = originalDocument;
    globalRecord.Image = originalImage;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
}

function createCanvasSpy(blobToReturn: Blob | null = new Blob(["preview"], { type: "image/webp" })) {
  const drawCalls: Array<[number, number, number, number]> = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        drawImage(_drawable: unknown, left: number, top: number, width: number, height: number) {
          drawCalls.push([left, top, width, height]);
        },
      };
    },
    toBlob(resolve: (value: Blob | null) => void) {
      resolve(blobToReturn);
    },
  };

  return { canvas, drawCalls };
}

test("optimizeImageBlobForPreview keeps already-safe image dimensions intact", async () => {
  const originalBlob = new Blob(["image"], { type: "image/png" });
  let closed = false;

  const result = await withPatchedPreviewGlobals(
    {
      createImageBitmap: async () => ({
        close() {
          closed = true;
        },
        height: 600,
        width: 800,
      } as ImageBitmap),
      document: {} as unknown as Document,
    },
    () => optimizeImageBlobForPreview(originalBlob),
  );

  assert.equal(result, originalBlob);
  assert.equal(closed, true);
});

test("optimizeImageBlobForPreview downscales oversized bitmaps before drawing them to canvas", async () => {
  const originalBlob = new Blob(["image"], { type: "image/jpeg" });
  const { canvas, drawCalls } = createCanvasSpy();
  let closed = false;

  const result = await withPatchedPreviewGlobals(
    {
      createImageBitmap: async () => ({
        close() {
          closed = true;
        },
        height: 4_000,
        width: 5_000,
      } as ImageBitmap),
      document: {
        createElement() {
          return canvas as unknown as HTMLCanvasElement;
        },
      } as unknown as Document,
    },
    () => optimizeImageBlobForPreview(originalBlob),
  );

  assert.notEqual(result, originalBlob);
  assert.equal(result.type, "image/webp");
  assert.deepEqual(drawCalls, [[0, 0, 2_048, 1_638]]);
  assert.equal(closed, true);
});

test("optimizeImageBlobForPreview falls back to an HTML image decode path when createImageBitmap is unavailable", async () => {
  const originalBlob = new Blob(["image"], { type: "image/png" });
  const { canvas, drawCalls } = createCanvasSpy();
  let revokedUrlCount = 0;

  class MockImage {
    height = 0;
    naturalHeight = 0;
    naturalWidth = 0;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    width = 0;
    #src = "";

    get src() {
      return this.#src;
    }

    set src(value: string) {
      this.#src = value;
      if (!value) {
        return;
      }

      this.width = 3_600;
      this.height = 2_400;
      this.naturalWidth = 3_600;
      this.naturalHeight = 2_400;
      queueMicrotask(() => {
        this.onload?.();
      });
    }
  }

  const result = await withPatchedPreviewGlobals(
    {
      createImageBitmap: undefined,
      document: {
        createElement() {
          return canvas as unknown as HTMLCanvasElement;
        },
      } as unknown as Document,
      Image: MockImage as unknown as typeof Image,
      urlCreateObjectUrl: () => "blob:http://127.0.0.1:5000/mock-preview",
      urlRevokeObjectUrl: () => {
        revokedUrlCount += 1;
      },
    },
    () => optimizeImageBlobForPreview(originalBlob),
  );

  assert.notEqual(result, originalBlob);
  assert.equal(result.type, "image/webp");
  assert.deepEqual(drawCalls, [[0, 0, 2_048, 1_365]]);
  assert.equal(revokedUrlCount, 1);
});

test("optimizeImageBlobForPreview respects abort signals before preview work starts", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    withPatchedPreviewGlobals(
      {
        document: {} as unknown as Document,
      },
      () => optimizeImageBlobForPreview(new Blob(["image"], { type: "image/png" }), {
        signal: controller.signal,
      }),
    ),
    (error: unknown) =>
      error instanceof Error
      && error.name === "AbortError",
  );
});
