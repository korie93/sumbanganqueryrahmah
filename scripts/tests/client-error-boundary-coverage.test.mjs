import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("major client feature sections remain isolated by error boundaries", () => {
  const appSource = readSource("client/src/App.tsx");
  const authenticatedEntrySource = readSource("client/src/app/AuthenticatedAppEntry.tsx");
  const authenticatedShellSource = readSource("client/src/app/AuthenticatedAppShell.tsx");
  const settingsSource = readSource("client/src/pages/Settings.tsx");
  const monitorSource = readSource("client/src/pages/SystemMonitorLayout.tsx");
  const collectionReportSource = readSource("client/src/pages/collection-report/CollectionReportContent.tsx");
  const floatingPanelSource = readSource("client/src/components/FloatingAIPanel.tsx");

  assert.match(appSource, /<AppRouteErrorBoundary[\s\S]*routeKey=\{routeKey\}[\s\S]*<Suspense/);
  assert.match(appSource, /routeKey=\{`authenticated-entry:\$\{currentPage\}:\$\{monitorSection\}`\}/);
  assert.match(authenticatedEntrySource, /<AppRouteErrorBoundary[\s\S]*routeKey=\{routeKey\}[\s\S]*<Suspense/);

  assert.match(authenticatedShellSource, /routeKey="change-password"/);
  assert.match(authenticatedShellSource, /routeKey=\{`\$\{currentPage\}:\$\{monitorSection\}:\$\{selectedImportId \|\| ""\}`\}/);
  assert.match(authenticatedShellSource, /<AppPageRenderer/);

  assert.match(settingsSource, /routeKey=\{`settings:\$\{controller\.selectedCategory\}`\}/);
  assert.match(monitorSource, /routeKey=\{`system-monitor:\$\{activeSection\}`\}/);
  assert.match(collectionReportSource, /routeKey=\{`collection-report:\$\{subPage\}`\}/);
  assert.match(floatingPanelSource, /<FloatingAIChatErrorBoundary boundaryKey=\{`\$\{activePage\}:\$\{Number\(isOpen\)\}`\}>/);
});
