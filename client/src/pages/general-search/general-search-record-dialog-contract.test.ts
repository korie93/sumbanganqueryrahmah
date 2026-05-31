import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const source = readFileSync(
  path.join(repoRoot, "client/src/pages/general-search/GeneralSearchRecordDialog.tsx"),
  "utf8",
);

test("general search record dialog has a bounded desktop viewport width", () => {
  assert.match(source, /w-\[min\(95vw,600px\)\]/);
  assert.doesNotMatch(source, /w-\[95vw\]\s+max-w-5xl/);
});
