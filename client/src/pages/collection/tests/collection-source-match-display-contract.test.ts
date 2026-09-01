import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/CollectionSourceMatchField.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

test("collection matching UI delegates source and Aging selection to the backend", () => {
  assert.match(source, /Auto-matching Saved/);
  assert.match(source, /Sumber, Aging, Calling Date, TOTAL DUE, dan OSP ditentukan oleh backend/);
  assert.match(source, /disabled=\{disabled \|\| loading\}/);
  assert.doesNotMatch(source, /save-collection-source-file/);
  assert.doesNotMatch(source, /selectedSourceFileId/);
});

test("collection matching action keeps its visible accessible name", () => {
  assert.doesNotMatch(source, /htmlFor="save-collection-source-match-action"/);
  assert.match(source, /id="save-collection-source-match-action"/);
  assert.match(source, /\{loading \? "Checking\.\.\." : "Semak Auto-matching"\}/);
});

test("collection matching UI renders only the server-authoritative settlement projection", () => {
  assert.match(source, /selectedMatch\.callingDate/);
  assert.match(source, /selectedMatch\.callingWindowEnd/);
  assert.match(source, /selectedMatch\.existingCumulative/);
  assert.match(source, /selectedMatch\.currentEntry/);
  assert.match(source, /selectedMatch\.projectedCumulative/);
  assert.match(source, /selectedMatch\.remainingAfterSave/);
  assert.match(source, /selectedMatch\?\.projectedCpStatus/);
  assert.doesNotMatch(source, /parseCollectionAmountToCents/);
  assert.doesNotMatch(source, /amountCents\s*>=\s*totalDueCents/);
});

test("collection matching layout protects narrow screens and long filenames", () => {
  assert.match(source, /min-w-0/);
  assert.match(source, /break-all/);
  assert.match(source, /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,10rem\),1fr\)\)\]/);
  assert.match(source, /dark:text-emerald-300/);
  assert.match(source, /dark:text-amber-300/);
});
