import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const source = readFileSync(
  path.join(repoRoot, "client/src/pages/import/SingleImportPanel.tsx"),
  "utf8",
);

test("single import preview exposes bounded accessible horizontal navigation", () => {
  assert.match(source, /ariaLabel="Import preview columns"/);
  assert.match(source, /navigationLabel="Import preview column navigation"/);
  assert.match(source, /showNavigationControls/);
  assert.match(source, /showScrollbar/);
  assert.match(source, /<table className="w-full min-w-max text-sm">/);
  assert.match(source, /parsedData\.slice\(0, 10\)/);
});
