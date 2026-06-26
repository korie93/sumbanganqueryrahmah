import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const source = readFileSync(
  path.join(repoRoot, "client/src/pages/general-search/GeneralSearchDesktopResultsTable.tsx"),
  "utf8",
);
const toolbarSource = readFileSync(
  path.join(repoRoot, "client/src/pages/general-search/GeneralSearchResultsToolbar.tsx"),
  "utf8",
);

test("general search desktop results expose named visible horizontal navigation", () => {
  assert.match(source, /ariaLabel="General search result columns"/);
  assert.match(source, /navigationLabel="General search table column navigation"/);
  assert.match(source, /showNavigationControls/);
  assert.match(source, /showScrollbar/);
  assert.doesNotMatch(source, /viewportClassName="[^"]*\bscrollbar-visible\b/);
});

test("general search rows-per-page controls have explicit accessible names", () => {
  const accessibleLabels = toolbarSource.match(/aria-label="Rows per page"/g) ?? [];
  assert.equal(accessibleLabels.length, 2);
});
