import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("login inputs preserve keyboard-visible focus without mouse focus noise", () => {
  const source = readSource("Login.css");

  assert.match(source, /\.login-input:focus-visible\s*\{/);
  assert.match(source, /outline:\s*2px solid var\(--login-input-focus-ring, hsl\(217 91% 60%\)\)/);
  assert.match(source, /@supports not selector\(:focus-visible\)/);
  assert.doesNotMatch(source, /\.login-input:focus,\s*\n\.login-input:focus-visible/);
  assert.doesNotMatch(source, /\.login-input:focus\s*\{[^}]*outline:\s*none/);
});

test("login fallback navigation uses history instead of full document reloads", () => {
  const source = readSource("useLoginPageState.ts");

  assert.match(source, /function navigateInternalFallback\(path: string\)/);
  assert.match(source, /window\.history\.pushState\(\{\}, "", path\)/);
  assert.match(source, /window\.dispatchEvent\(new Event\("popstate"\)\)/);
  assert.doesNotMatch(source, /window\.location\.href/);
});
