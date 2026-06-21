import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const saveCollectionPageSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/SaveCollectionPage.tsx"),
  "utf8",
);

test("save collection batch select uses explicit invalid props for Edge a11y inspection", () => {
  assert.match(saveCollectionPageSource, /const batchValidationProps = state\.fieldErrors\.batch/);
  assert.match(saveCollectionPageSource, /"aria-invalid": "true" as const/);
  assert.match(saveCollectionPageSource, /<select[\s\S]*\{\.\.\.batchValidationProps\}/);

  const batchSelectMatch = saveCollectionPageSource.match(/<select[\s\S]*?<\/select>/);
  assert.ok(batchSelectMatch);
  assert.doesNotMatch(batchSelectMatch[0], /aria-invalid=\{/);
});
