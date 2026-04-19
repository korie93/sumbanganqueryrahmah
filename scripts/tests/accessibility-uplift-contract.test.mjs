import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readRepoFile(relativePath) {
  return readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

test("reviewed icon-only controls keep explicit accessible names", () => {
  const loginSource = readRepoFile("client/src/pages/Login.tsx");
  const floatingAiSource = readRepoFile("client/src/components/FloatingAI.tsx");
  const sidebarSource = readRepoFile("client/src/components/ui/sidebar.tsx");

  assert.match(loginSource, /aria-label="Hide password"/);
  assert.match(loginSource, /aria-label="Show password"/);
  assert.match(floatingAiSource, /aria-label="Minimize AI panel"/);
  assert.match(floatingAiSource, /aria-label=\{isOpen \? "Minimize AI SQR panel" : "Open AI SQR panel"\}/);
  assert.match(sidebarSource, /aria-label="Toggle sidebar"/);
});

test("stable reviewed keyboard shortcuts stay exposed via aria-keyshortcuts", () => {
  const sidebarSource = readRepoFile("client/src/components/ui/sidebar.tsx");
  const saveCollectionSource = readRepoFile("client/src/pages/collection/SaveCollectionPage.tsx");

  assert.match(sidebarSource, /aria-keyshortcuts="Control\+B Meta\+B"/);
  assert.match(saveCollectionSource, /aria-keyshortcuts="Control\+S Meta\+S"/);
});

test("the existing dark mode toggle remains available in the reviewed user menu", () => {
  const navbarUserMenuSource = readRepoFile("client/src/components/NavbarUserMenuContent.tsx");

  assert.match(navbarUserMenuSource, /DropdownMenuRadioGroup/);
  assert.match(navbarUserMenuSource, /Appearance/);
  assert.match(navbarUserMenuSource, /Light Mode/);
  assert.match(navbarUserMenuSource, /Dark Mode/);
});
