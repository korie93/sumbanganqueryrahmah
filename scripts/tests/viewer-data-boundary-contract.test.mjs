import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("ViewerDataTable keeps a local panel error boundary around the heavy table renderers", () => {
  const source = readRepoFile("client/src/pages/viewer/ViewerDataTable.tsx");

  assert.match(source, /import\s+\{\s*PanelErrorBoundary\s*\}\s+from\s+"@\/components\/PanelErrorBoundary";/);
  assert.match(source, /<PanelErrorBoundary[\s\S]*panelLabel="Viewer data table"/);
  assert.match(source, /boundaryKey={`viewer-data-table:/);
});
