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
  const source = readSource("useLoginRedirect.ts");

  assert.match(source, /function navigateInternalFallback\(path: string\)/);
  assert.match(source, /window\.history\.pushState\(\{\}, "", path\)/);
  assert.match(source, /window\.dispatchEvent\(new Event\("popstate"\)\)/);
  assert.doesNotMatch(source, /window\.location\.href/);
});

test("login page state is composed from focused documented hooks", () => {
  const orchestrator = readSource("useLoginPageState.ts");
  assert.match(orchestrator, /useLoginFormState\(\)/);
  assert.match(orchestrator, /useLoginSecurity\(\{/);
  assert.match(orchestrator, /useLoginRedirect\(\{/);
  assert.match(orchestrator, /useLoginSubmission\(\{/);

  for (const fileName of [
    "useLoginFormState.ts",
    "useLoginSecurity.ts",
    "useLoginRedirect.ts",
    "useLoginSubmission.ts",
  ]) {
    const source = readSource(fileName);
    assert.match(source, /\/\*\*[\s\S]*@returns[\s\S]*\*\//);
    assert.match(source, /export function useLogin/);
  }
});

test("login request lifecycle aborts pending auth work and ignores stale responses", () => {
  const source = readSource("useLoginRequestLifecycle.ts");

  assert.match(source, /loginAbortControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /mountedRef\.current = false/);
  assert.match(source, /loginInFlightRef\.current = false/);
  assert.match(source, /controller\?\.signal\.aborted/);
  assert.match(source, /setLoading\(false\)/);
});
