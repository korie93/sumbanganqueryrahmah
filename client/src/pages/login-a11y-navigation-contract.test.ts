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

test("login card spacing uses container queries with a media-query fallback", () => {
  const source = readSource("Login.css");

  assert.match(source, /container-name:\s*login-shell/);
  assert.match(source, /container-type:\s*inline-size/);
  assert.match(source, /@container login-shell \(min-width:\s*32rem\)/);
  assert.match(source, /@supports not \(container-type:\s*inline-size\)/);
});

test("login fallback navigation uses router navigation instead of manual history events", () => {
  const redirectSource = readSource("useLoginRedirect.ts");
  const submissionSource = readSource("useLoginSubmission.ts");

  assert.match(redirectSource, /import \{ useLocation \} from "wouter"/);
  assert.match(redirectSource, /const \[, navigate\] = useLocation\(\)/);
  assert.match(redirectSource, /navigate\("\/"\)/);
  assert.match(redirectSource, /navigate\("\/forgot-password"\)/);
  assert.match(submissionSource, /const \[, navigate\] = useLocation\(\)/);
  assert.match(submissionSource, /navigate\("\/banned"\)/);
  assert.doesNotMatch(redirectSource, /window\.history\.pushState/);
  assert.doesNotMatch(redirectSource, /dispatchEvent\(new Event\("popstate"\)\)/);
  assert.doesNotMatch(submissionSource, /window\.history\.pushState/);
  assert.doesNotMatch(submissionSource, /dispatchEvent\(new Event\("popstate"\)\)/);
  assert.doesNotMatch(redirectSource, /window\.location\.href/);
  assert.doesNotMatch(submissionSource, /window\.location\.href/);
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

test("login submit validation focuses the first invalid field with announced errors", () => {
  const source = readSource("Login.tsx");

  assert.match(source, /const usernameInputRef = useRef<HTMLInputElement \| null>\(null\)/);
  assert.match(source, /const passwordInputRef = useRef<HTMLInputElement \| null>\(null\)/);
  assert.match(source, /const twoFactorCodeInputRef = useRef<HTMLInputElement \| null>\(null\)/);
  assert.match(source, /const captchaResponseInputRef = useRef<HTMLInputElement \| null>\(null\)/);
  assert.match(source, /lastFocusedValidationKeyRef/);
  assert.match(source, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /ref=\{usernameInputRef\}/);
  assert.match(source, /ref=\{passwordInputRef\}/);
  assert.match(source, /ref=\{twoFactorCodeInputRef\}/);
  assert.match(source, /ref=\{captchaResponseInputRef\}/);
  assert.match(source, /id="login-username-error"[^>]*role="alert"/);
  assert.match(source, /id="login-password-error"[^>]*role="alert"/);
  assert.match(source, /id="login-two-factor-error"[^>]*role="alert"/);
  assert.match(source, /id="login-captcha-error"[^>]*role="alert"/);
});
