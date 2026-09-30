import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MOBILE_LANDSCAPE_QUERY =
  /@media \(max-width: 767px\) and \(max-height: 560px\) and \(orientation: landscape\)/;

function readClientSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("authenticated shell compacts spacing for short mobile landscape viewports", () => {
  const shellCss = readClientSource("AuthenticatedAppShell.css");
  const glassCss = readClientSource("../components/GlassWrapper.css");

  assert.match(shellCss, MOBILE_LANDSCAPE_QUERY);
  assert.match(
    shellCss,
    /calc\(var\(--spacing-2\) \+ var\(--safe-area-inset-bottom\)\)/,
  );
  assert.match(shellCss, /\.ops-page-frame\s*{[\s\S]*gap:\s*var\(--spacing-3\);/);
  assert.match(shellCss, /\.ops-empty-state\s*{[\s\S]*min-height:\s*180px;/);
  assert.match(glassCss, MOBILE_LANDSCAPE_QUERY);
  assert.match(glassCss, /\.glass-wrapper\s*{[\s\S]*border-radius:\s*var\(--radius-surface\);/);
});

test("public auth and login shells keep content reachable in short mobile landscape viewports", () => {
  const publicAuthCss = readClientSource("../components/PublicAuthLayout.css");
  const v17Css = readClientSource("../components/auth/AuthV17Layout.css");

  assert.match(publicAuthCss, MOBILE_LANDSCAPE_QUERY);
  assert.match(
    publicAuthCss,
    /\.public-auth-layout__main\s*{[\s\S]*align-items:\s*flex-start;[\s\S]*justify-content:\s*flex-start;[\s\S]*calc\(var\(--spacing-3\) \+ var\(--safe-area-inset-bottom\)\)/,
  );
  assert.match(
    publicAuthCss,
    /\.public-auth-layout__halo,[\s\S]*\.public-auth-layout__center-glow\s*{[\s\S]*display:\s*none;/,
  );

  assert.match(v17Css, /min-height:\s*100vh;\s*min-height:\s*100dvh;/);
  assert.match(v17Css, /@media[^\{]*max-height:[\s\S]*\.auth-v17-wrap\s*\{\s*transform:\s*none;/);
  assert.match(v17Css, /@media \(max-width: 699px\)[\s\S]*\.auth-v17-side\s*\{\s*min-height:\s*auto;/);
  assert.doesNotMatch(v17Css, /\.auth-v17-(?:side|wrap|view|content)\s*\{[^}]*(?:overflow:\s*(?:hidden|clip)|max-height:)/);
});
