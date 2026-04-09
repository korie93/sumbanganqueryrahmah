import assert from "node:assert/strict";
import test from "node:test";
import {
  computeSummary,
  formatAmountRM,
  isPositiveAmount,
  toReceiptPayloads,
  validateReceiptFile,
} from "./utils";

function createFileLike(input: {
  name: string;
  type: string;
  size: number;
}): File {
  return {
    name: input.name,
    type: input.type,
    size: input.size,
  } as File;
}

test("validateReceiptFile accepts image/jpg MIME alias", () => {
  const file = createFileLike({
    name: "receipt.jpg",
    type: "image/jpg",
    size: 120_000,
  });

  assert.equal(validateReceiptFile(file), null);
});

test("validateReceiptFile accepts image/jfif MIME via canonical JPEG normalization", () => {
  const file = createFileLike({
    name: "receipt.jpeg",
    type: "image/jfif",
    size: 120_000,
  });

  assert.equal(validateReceiptFile(file), null);
});

test("validateReceiptFile falls back to extension when browser omits MIME type", () => {
  const file = createFileLike({
    name: "receipt.png",
    type: "",
    size: 130_000,
  });

  assert.equal(validateReceiptFile(file), null);
});

test("validateReceiptFile rejects unsupported files even when MIME type is missing", () => {
  const file = createFileLike({
    name: "receipt.heic",
    type: "",
    size: 90_000,
  });

  assert.match(String(validateReceiptFile(file)), /must be JPG, PNG, WebP, or PDF/i);
});

test("toReceiptPayloads reads receipts sequentially to avoid memory spikes", async () => {
  const originalFileReader = globalThis.FileReader;
  let activeReads = 0;
  let maxConcurrentReads = 0;
  let completedReads = 0;

  class MockFileReader {
    public result: string | ArrayBuffer | null = null;

    public onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

    public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

    readAsDataURL(file: Blob) {
      activeReads += 1;
      maxConcurrentReads = Math.max(maxConcurrentReads, activeReads);
      const payloadIndex = completedReads + 1;

      setTimeout(() => {
        completedReads += 1;
        activeReads -= 1;
        this.result = `data:${(file as File).type || "application/octet-stream"};base64,receipt-${payloadIndex}`;
        this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
      }, 0);
    }
  }

  Object.defineProperty(globalThis, "FileReader", {
    value: MockFileReader,
    configurable: true,
    writable: true,
  });

  try {
    const payloads = await toReceiptPayloads([
      createFileLike({ name: "first.png", type: "image/png", size: 120_000 }),
      createFileLike({ name: "second.jpg", type: "image/jpeg", size: 140_000 }),
      createFileLike({ name: "third.webp", type: "image/webp", size: 160_000 }),
    ]);

    assert.equal(payloads.length, 3);
    assert.equal(maxConcurrentReads, 1);
    assert.match(payloads[0]?.contentBase64 || "", /^data:image\/png;base64,/);
    assert.match(payloads[2]?.contentBase64 || "", /^data:image\/webp;base64,/);
  } finally {
    Object.defineProperty(globalThis, "FileReader", {
      value: originalFileReader,
      configurable: true,
      writable: true,
    });
  }
});

test("collection amount helpers normalize grouped MYR strings consistently", () => {
  assert.equal(isPositiveAmount("1,200.50"), true);
  assert.equal(isPositiveAmount("bad-value"), false);
  assert.equal(formatAmountRM("1,200.50"), "RM 1,200.50");
  assert.deepEqual(
    computeSummary([
      { amount: "1,200.50" } as { amount: string },
      { amount: "99.50" } as { amount: string },
      { amount: "bad-value" } as { amount: string },
    ] as never),
    {
      totalAmount: 1300,
      totalRecords: 3,
    },
  );
});
