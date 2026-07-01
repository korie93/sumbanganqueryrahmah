import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionRecordsSourceDir = path.resolve(__dirname, "..");

test("collection records receipt preview clears stale source before revoking object url", () => {
  const source = readFileSync(
    path.join(collectionRecordsSourceDir, "useCollectionReceiptPreview.ts"),
    "utf8",
  );

  assert.match(
    source,
    /setReceiptPreviewError\(""\);\s*setReceiptPreviewSource\(""\);\s*clearReceiptPreviewObjectUrl\(\);/s,
  );
});
