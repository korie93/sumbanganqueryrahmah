import assert from "node:assert/strict";
import test from "node:test";
import { validateReceiptFile } from "./utils";

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
