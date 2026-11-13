import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSource(fileName: string) {
  return readFileSync(path.resolve(__dirname, fileName), "utf8");
}

test("V17 auth controls and OTP slots preserve visible keyboard focus", () => {
  const source = readSource("../components/auth/AuthV17Layout.css");
  const otp = readSource("../components/auth/AuthOtpInput.tsx");
  assert.match(source, /\.auth-v17 :focus-visible\s*\{[^}]*outline:\s*[23]px solid /);
  assert.match(source, /\.auth-v17 :focus-visible\s*\{[^}]*outline-offset:\s*2px;/);
  assert.match(source, /\.auth-v17-otp__slot\[data-active="true"\]\s*\{[^}]*box-shadow:/);
  assert.match(otp, /onFocus=\{\(event\) => \{ setFocused\(true\)/);
  assert.match(otp, /onBlur=\{\(event\) => \{ setFocused\(false\)/);
});

test("V17 login uses a bounded split form with a stacked mobile fallback", () => {
  const source = readSource("../components/auth/AuthV17Layout.css");
  const layout = readSource("../components/auth/AuthV17Layout.tsx");
  assert.match(source, /\.auth-v17\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/);
  assert.match(source, /\.auth-v17-wrap\s*\{[^}]*width:\s*100%;/);
  assert.match(source, /\.auth-form-slot\s*\{[^}]*width:\s*min\(100%, 24rem\);[^}]*margin-top:\s*clamp\(2rem, 12vh, 6rem\);[^}]*min-height:\s*var\(--auth-slot-min-h, 34rem\);/);
  assert.match(source, /\.auth-v17-side\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*align-items:\s*stretch;/);
  assert.doesNotMatch(source, /\.auth-v17-wrap\s*\{[^}]*transform:\s*translate/);
  assert.doesNotMatch(source, /\.auth-v17-forgot \.auth-v17-side\s*\{[^}]*padding-top:/);
  assert.match(source, /@media \(max-width: 767px\)[\s\S]*\.auth-v17\s*\{\s*display:\s*block;/);
  assert.match(source, /\.auth-v17-view\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/);
  assert.match(layout, /<section className="auth-v17-side" aria-label=\{t\(recoveryArtwork \? "auth\.v17Recovery\.forgotTitle" : "auth\.v17\.signin"\)\}>/);
  assert.match(layout, /<div className="auth-form-slot">\s*<AuthShellContext\.Provider value=\{frame\}>\{children\}<\/AuthShellContext\.Provider>\s*<\/div>\s*<p className="auth-v17-help">/);
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
