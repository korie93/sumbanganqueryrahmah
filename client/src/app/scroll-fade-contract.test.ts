import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readClientSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("global scroll fade utilities are mask based and forced-colors safe", () => {
  const indexCss = readClientSource("../index.css");

  assert.match(indexCss, /\.scroll-fade-y\s*{[\s\S]*--scroll-fade-size:\s*1\.25rem;/);
  assert.match(indexCss, /\.scroll-fade-y\s*{[\s\S]*mask-image:\s*linear-gradient\(\s*to bottom,/);
  assert.match(indexCss, /\.scroll-fade-x\s*{[\s\S]*mask-image:\s*linear-gradient\(\s*to right,/);
  assert.match(
    indexCss,
    /@media \(forced-colors: active\)\s*{[\s\S]*\.scroll-fade-y,[\s\S]*\.scroll-fade-x\s*{[\s\S]*mask-image:\s*none;/,
  );
});

test("long scrollable lists opt in to vertical scroll fade indicators", () => {
  const sourcePaths = [
    "../pages/general-search/GeneralSearchDesktopResultsTable.tsx",
    "../pages/saved/SavedImportsList.tsx",
    "../pages/audit-logs/AuditLogsRecordsList.tsx",
    "../pages/ai/AIConversationCard.tsx",
    "../pages/viewer/ViewerColumnSelectorList.tsx",
    "../pages/import/BulkImportPanel.tsx",
  ];

  for (const sourcePath of sourcePaths) {
    const source = readClientSource(sourcePath);

    assert.match(source, /overflow-y-auto[\w\W]{0,80}scroll-fade-y|scroll-fade-y[\w\W]{0,80}overflow-y-auto/);
  }
});
