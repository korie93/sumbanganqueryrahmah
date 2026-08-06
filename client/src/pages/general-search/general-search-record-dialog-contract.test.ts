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

test("general search record dialog uses a bounded responsive workspace", () => {
  assert.match(source, /w-\[min\(94vw,960px\)\]/);
  assert.match(source, /sm:w-\[min\(94vw,960px\)\]/);
  assert.match(source, /sm:max-w-none/);
  assert.match(source, /max-h-\[88dvh\]/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(source, /orderedHeaders\.map/);
});

test("general search record dialog keeps status and grouped detail sections", () => {
  assert.match(source, /Customer &amp; Account 360/);
  assert.match(source, /Status collection/);
  assert.match(source, /Identiti & akaun/);
  assert.match(source, /Hubungan & alamat/);
  assert.match(source, /Sumber data/);
  assert.match(source, /Maklumat tambahan/);
  assert.match(source, /Medan kosong/);
});
