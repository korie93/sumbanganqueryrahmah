import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("theme tokens keep shared public-auth and home radius tokens plus logical skip-link positioning", () => {
  const themeTokens = readRepoFile("client/src/theme-tokens.css");

  assert.match(themeTokens, /--public-auth-control-radius:\s*0\.75rem;/);
  assert.match(themeTokens, /--public-auth-card-radius:\s*2rem;/);
  assert.match(themeTokens, /--public-auth-card-radius-compact:\s*1\.5rem;/);
  assert.match(themeTokens, /--home-hero-radius:\s*2rem;/);
  assert.match(themeTokens, /--home-surface-radius:\s*1\.75rem;/);
  assert.match(themeTokens, /--home-card-radius:\s*1\.25rem;/);
  assert.match(themeTokens, /\.skip-to-main-link\s*\{[\s\S]*?inset-inline-start:\s*var\(--spacing-3\);/);
});

test("login and public auth controls consume the shared public-auth foundation tokens", () => {
  const loginCss = readRepoFile("client/src/pages/Login.css");
  const publicAuthControlsCss = readRepoFile("client/src/components/PublicAuthControls.css");
  const loginTsx = readRepoFile("client/src/pages/Login.tsx");

  assert.match(publicAuthControlsCss, /border-radius:\s*var\(--public-auth-control-radius\);/);
  assert.match(publicAuthControlsCss, /--public-auth-button-primary-bg,\s*var\(--public-auth-primary-bg\)/);
  assert.match(loginCss, /border-radius:\s*var\(--public-auth-card-radius\);/);
  assert.match(loginCss, /border-radius:\s*var\(--public-auth-card-radius-compact\);/);
  assert.match(loginCss, /--public-auth-button-primary-bg:\s*var\(--login-submit-gradient\);/);
  assert.match(loginCss, /\.login-password-toggle\s*\{[\s\S]*?inset-inline-end:\s*0\.25rem;/);
  assert.match(loginCss, /\.login-password-input\s*\{[\s\S]*?padding-inline-end:\s*3rem;/);
  assert.match(loginTsx, /className="login-input login-password-input w-full rounded-xl px-4 py-3 transition-all"/);
});

test("home cards use the shared reviewed radius tokens", () => {
  const homeCss = readRepoFile("client/src/pages/Home.css");

  assert.match(homeCss, /border-radius:\s*var\(--home-hero-radius\);/);
  assert.match(homeCss, /border-radius:\s*var\(--home-surface-radius\);/);
  assert.equal((homeCss.match(/border-radius:\s*var\(--home-card-radius\);/g) ?? []).length, 3);
});
