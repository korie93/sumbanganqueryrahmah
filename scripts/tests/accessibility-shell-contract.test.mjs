import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("App keeps a skip-to-main link wired to main-content", () => {
  const appSource = readRepoFile("client/src/App.tsx");

  assert.match(appSource, /className="skip-to-main-link"/);
  assert.match(appSource, /href="#main-content"/);
  assert.match(appSource, /Skip to main content/);
});

test("theme tokens keep skip link focus styling visible", () => {
  const themeTokens = readRepoFile("client/src/theme-tokens.css");

  assert.match(themeTokens, /\.skip-to-main-link:focus\s*\{/);
  assert.match(themeTokens, /transform:\s*translateY\(0\);/);
  assert.match(themeTokens, /box-shadow:\s*0 0 0 3px hsl\(var\(--ring\) \/ 0\.42\), var\(--nav-trigger-shadow\);/);
  assert.match(themeTokens, /#main-content\s*\{/);
});

test("primary routed page shells keep main-content landmarks", () => {
  const requiredMainRoots = [
    "client/src/app/AuthenticatedAppShell.tsx",
    "client/src/components/PublicAuthLayout.tsx",
    "client/src/pages/Banned.tsx",
    "client/src/pages/Forbidden.tsx",
    "client/src/pages/LandingHeroShell.tsx",
    "client/src/pages/Login.tsx",
    "client/src/pages/Maintenance.tsx",
    "client/src/pages/NotFound.tsx",
    "client/src/pages/not-found.tsx",
  ];

  for (const filePath of requiredMainRoots) {
    const source = readRepoFile(filePath);
    assert.match(source, /<main[\s\S]*?id="main-content"/, `${filePath} must keep id=\"main-content\" on its main landmark`);
    assert.match(source, /tabIndex=\{-1\}/, `${filePath} must keep tabIndex={-1} on its main landmark`);
  }
});
