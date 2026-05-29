import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cleanupReceiptImagePreviewElement } from "@/pages/collection-records/ReceiptPreviewContent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("cleanupReceiptImagePreviewElement removes the source attribute only", () => {
  const removedAttributes: string[] = [];

  cleanupReceiptImagePreviewElement({
    removeAttribute: (name: string) => {
      removedAttributes.push(name);
    },
  });

  assert.deepEqual(removedAttributes, ["src"]);
});

test("receipt image cleanup avoids assigning an empty image source", () => {
  const source = readFileSync(path.resolve(__dirname, "ReceiptPreviewContent.tsx"), "utf8");

  assert.match(source, /cleanupReceiptImagePreviewElement\(image\)/);
  assert.doesNotMatch(source, /image\.src\s*=\s*""/);
});
