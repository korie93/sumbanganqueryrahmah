import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const clientSrcRoot = path.join(repoRoot, "client", "src");

function readClientSource(relativePath) {
  return readFileSync(path.join(clientSrcRoot, relativePath), "utf8");
}

const exportSources = [
  "pages/dashboard/utils.ts",
  "pages/viewer/export-file-utils.ts",
  "pages/collection-records/export.ts",
  "pages/general-search/export.ts",
  "pages/backup-restore/backup-export.ts",
  "pages/audit-logs/audit-logs-export.ts",
];

test("PDF and canvas export dependencies stay lazy-loaded", () => {
  const combinedSource = exportSources
    .map((relativePath) => readClientSource(relativePath))
    .join("\n");

  assert.doesNotMatch(combinedSource, /import\s+[^;\n]*from\s+["']jspdf["']/);
  assert.doesNotMatch(combinedSource, /import\s+[^;\n]*from\s+["']html2canvas["']/);
  assert.match(combinedSource, /import\("jspdf"\)/);
  assert.match(combinedSource, /import\("html2canvas"\)/);
});
