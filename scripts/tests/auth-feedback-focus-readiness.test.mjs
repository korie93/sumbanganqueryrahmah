import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../auth-feedback-browser.mjs", import.meta.url), "utf8");

function section(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertObservesAutofocusOnly(block) {
  assert.doesNotMatch(block, /\.focus\s*\(/, "The test must observe application autofocus, not focus the field itself.");
  assert.doesNotMatch(block, /document\.activeElement/, "A one-shot activeElement read races with React effects and animation frames.");
  assert.doesNotMatch(block, /waitForTimeout|setTimeout/, "Readiness must use a bounded assertion, not a fixed sleep.");
}

test("restarted expired and invalid login challenges await real OTP autofocus within a bounded timeout", () => {
  assert.match(source, /import\s*\{\s*expect\s*\}\s*from\s*"@playwright\/test"/);
  const restart = section(
    'for (const code of ["TWO_FACTOR_CHALLENGE_EXPIRED", "TWO_FACTOR_CHALLENGE_INVALID"])',
    "assert.equal(counts.login, 3)",
  );
  assert.match(restart, /await page\.getByTestId\("input-two-factor-code"\)\.waitFor\(\{ state: "visible" \}\)/);
  assert.match(restart, /assert\.equal\(await page\.getByTestId\("input-two-factor-code"\)\.inputValue\(\), ""\)/);
  assert.match(restart, /await expect\(page\.getByTestId\("input-two-factor-code"\)\)\.toBeFocused\(\{ timeout: 5_000 \}\)/);
  assertObservesAutofocusOnly(restart);
});

test("guided authenticator setup awaits code-entry autofocus without forcing focus", () => {
  const confirm = section("async function confirmGuidedSetup() {", 'await visibleText(panel, "Status: Not enabled")');
  assert.match(confirm, /await panel\.getByRole\("button", \{ name: "I have added the account", exact: true \}\)\.click\(\)/);
  assert.match(confirm, /await visibleText\(panel\.locator\("\[role=status\]"\), "Step 3 of 3"\)/);
  assert.match(confirm, /await expect\(page\.locator\("#my-account-two-factor-code"\)\)\.toBeFocused\(\{ timeout: 5_000 \}\)/);
  assertObservesAutofocusOnly(confirm);
});

test("autofocus readiness retains challenge rejection and unauthenticated-state checks", () => {
  const login = section('console.log("[auth-feedback-browser] PASS invalid/expired/used/superseded/already-activated link feedback")', 'await go("setup")');
  assert.match(login, /Kod pengesah tidak betul\./);
  assert.match(login, /loginError = "TWO_FACTOR_CODE_REPLAYED"/);
  assert.match(login, /Tunggu kod baharu/);
  assert.match(login, /Sila log masuk semula/);
  assert.match(login, /assert\.equal\(counts\.login, 3\)/);
  assert.match(login, /assert\.equal\(counts\.verify, 4\)/);
  assert.match(login, /assert\.equal\(await page\.evaluate\(\(\) => document\.body\.dataset\.authenticated\), undefined\)/);
  assert.doesNotMatch(login, /\.catch\s*\(/, "Autofocus failures must propagate, not be swallowed.");
});

test("autofocus failures keep credential-safe diagnostics and a masked screenshot", () => {
  const failure = source.slice(source.lastIndexOf("} catch (error) {"), source.lastIndexOf("} finally {"));
  assert.ok(failure.length > 0, "The top-level failure handler remains identifiable.");
  assert.match(failure, /mask: \[page\.locator\("\[data-testid='two-factor-qr'\], input"\)\]/);
  assert.match(failure, /throw new Error\("Isolated auth UI verification failed\./);
  assert.match(failure, /raw errors are suppressed/);
  assert.doesNotMatch(failure, /error(?:\?|)\.(?:message|stack)|\$\{error\}|cause:\s*error|console\.(?:error|log|warn)\(error\)/);
});

test("personal Security verification follows English UI without changing public auth language", () => {
  const credential = section("async function checkCredentialPasswordFlow(view) {", "async function checkPasswordRejections(view) {");
  assert.match(credential, /view === "change" \? "Kemas Kini Kata Laluan" : "Update password"/);
  assert.match(credential, /view === "change" \? "Pengesahan kata laluan tidak sepadan\." : "Password confirmation does not match\."/);
  assert.match(credential, /checkPasswordVisibility\(ids, view === "change" \? "ms" : "en"\)/);
  const fixture = readFileSync(new URL("../fixtures/auth-feedback-ui.jsx", import.meta.url), "utf8");
  assert.match(fixture, /syncCurrentUser: setCurrentUser, locale: "en"/);
  const guided = section('await go("setup");', 'console.log("[auth-feedback-browser] PASS guided 2FA setup');
  assert.match(guided, /Verify and enable 2FA/);
  assert.match(guided, /The authenticator code is incorrect/);
  assert.match(guided, /Start setup again/);
  assert.doesNotMatch(guided, /Aktifkan 2FA|Langkah|Kod pengesah tidak betul/);
});
