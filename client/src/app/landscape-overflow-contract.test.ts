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
  assert.match(glassCss, /\.glass-wrapper\s*{[\s\S]*border-radius:\s*16px;/);
});

test("public auth and login shells keep content reachable in short mobile landscape viewports", () => {
  const publicAuthCss = readClientSource("../components/PublicAuthLayout.css");
  const loginCss = readClientSource("../pages/Login.css");

  assert.match(publicAuthCss, MOBILE_LANDSCAPE_QUERY);
  assert.match(
    publicAuthCss,
    /\.public-auth-layout__main\s*{[\s\S]*align-items:\s*flex-start;[\s\S]*justify-content:\s*flex-start;[\s\S]*calc\(var\(--spacing-3\) \+ var\(--safe-area-inset-bottom\)\)/,
  );
  assert.match(
    publicAuthCss,
    /\.public-auth-layout__halo,[\s\S]*\.public-auth-layout__center-glow\s*{[\s\S]*display:\s*none;/,
  );

  assert.match(loginCss, MOBILE_LANDSCAPE_QUERY);
  assert.match(
    loginCss,
    /\.login-content--shell\s*{[\s\S]*align-items:\s*flex-start;[\s\S]*justify-content:\s*flex-start;[\s\S]*calc\(0\.75rem \+ var\(--safe-area-inset-bottom\)\)/,
  );
  assert.match(loginCss, /\.login-card-form\s*{[\s\S]*padding:\s*1rem 1\.1rem !important;/);
  assert.match(loginCss, /\.login-bg-orb\s*{[\s\S]*display:\s*none;/);
  assert.match(loginCss, /\.login-card::before,[\s\S]*\.login-bg-effect\s*{[\s\S]*display:\s*none;/);
});
