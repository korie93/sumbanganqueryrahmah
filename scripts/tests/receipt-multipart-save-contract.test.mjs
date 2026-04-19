import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const sourcePath = path.resolve(
  process.cwd(),
  "server/routes/collection-receipt-multipart-save-utils.ts",
);

test("multipart receipt saving keeps explicit stream error tracking and cleanup hooks", () => {
  const source = readFileSync(sourcePath, "utf8");

  assert.match(source, /sourceStream\.once\("error"/);
  assert.match(source, /captureAndValidate\.once\("error"/);
  assert.match(source, /writeStream\.once\("error"/);
  assert.match(source, /detachObservedStreamListeners/);
  assert.match(source, /Multipart collection receipt stream failed during save/);
});
