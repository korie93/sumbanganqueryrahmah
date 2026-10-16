import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("collection section navigation keeps text and accessible current-state cues", () => {
  const source = readSource("../collection-report/CollectionSidebar.tsx");

  assert.match(source, /getAriaCurrentPageProps\(active\)/);
  assert.match(source, /border-primary\/30 bg-primary\/10 text-primary/);
  assert.match(source, /aria-label=\{item\.label\}/);
  assert.match(source, /focus-visible:ring-2 focus-visible:ring-ring/);
  assert.match(source, /getCollectionSectionShortLabel\(item\.key, item\.label\)/);
  const css = readSource("../CollectionReport.css");
  assert.match(css, /\.collection-section-link[^}]*min-height: 44px/s);
  assert.match(css, /\.collection-section-nav[^}]*overflow-x: auto/s);
  assert.doesNotMatch(source, /<Sheet|aria-haspopup="dialog"/);
  assert.doesNotMatch(source, /border-primary\/15 bg-primary\/10 px-2 py-0\.5 text-xxs text-primary/);
  assert.doesNotMatch(source, /border-primary\/35 bg-primary\/10 text-primary/);
});

test("settings navigation retains semantic current state, dirty counts and accessible sheet focus", () => {
  const settingsSidebarSource = readSource("SettingsSidebar.tsx");
  assert.match(settingsSidebarSource, /getAriaCurrentPageProps\(active\)/);
  assert.match(settingsSidebarSource, /bg-primary\/10 text-primary/);
  assert.match(settingsSidebarSource, /aria-label=\{`\$\{item\.badge\} unsaved changes`\}/);
  assert.match(settingsSidebarSource, /getAriaExpandedProps\(mobileOpen\)/);
  assert.match(settingsSidebarSource, /onCloseAutoFocus=/);
  assert.match(settingsSidebarSource, /launcherRef\.current\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(settingsSidebarSource, /HorizontalScrollHint|LazySideTabNavigation|rounded-\[2rem\]/);
});

test("account sections retain text, semantic active state and a scrollable compact row", () => {
  const accountNavSource = readSource("account-management/UserAccountManagementNav.tsx");

  for (const source of [accountNavSource]) {
    assert.match(source, /getAriaCurrentPageProps\(activeTab === id\)/);
    assert.match(source, /border-primary bg-primary\/5 text-primary/);
    assert.match(source, /HorizontalScrollHint viewportClassName="flex gap-1"/);
    assert.match(source, /focus-visible:ring-inset focus-visible:ring-ring/);
    assert.match(source, /min-h-11/);
    assert.doesNotMatch(source, /border-primary\/35 bg-primary\/10 text-primary/);
  }
});
