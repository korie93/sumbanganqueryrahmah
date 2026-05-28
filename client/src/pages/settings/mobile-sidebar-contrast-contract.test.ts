import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string) {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("collection mobile launcher keeps active chips and buttons on high-contrast primary tokens", () => {
  const source = readSource("../collection-report/CollectionSidebar.tsx");

  assert.match(source, /<Badge className="rounded-full px-2 py-0\.5 text-xxs shadow-sm">/);
  assert.match(source, /border-primary bg-primary text-primary-foreground shadow-sm/);
  assert.match(source, /active\s*\?\s*"bg-primary-foreground text-primary"/);
  assert.doesNotMatch(source, /border-primary\/15 bg-primary\/10 px-2 py-0\.5 text-xxs text-primary/);
  assert.doesNotMatch(source, /border-primary\/35 bg-primary\/10 text-primary/);
});

test("settings and account mobile launchers keep active section pills on accessible foreground tokens", () => {
  const settingsSidebarSource = readSource("SettingsSidebar.tsx");
  const accountNavSource = readSource("account-management/UserAccountManagementNav.tsx");

  for (const source of [settingsSidebarSource, accountNavSource]) {
    assert.match(source, /border-primary bg-primary text-primary-foreground shadow-sm/);
    assert.match(source, /active\s*\?\s*"bg-primary-foreground text-primary"/);
    assert.doesNotMatch(source, /border-primary\/35 bg-primary\/10 text-primary/);
  }
});
