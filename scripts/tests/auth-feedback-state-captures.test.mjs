import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../auth-feedback-browser.mjs", import.meta.url), "utf8");
const fixture = readFileSync(new URL("../fixtures/auth-feedback-ui.jsx", import.meta.url), "utf8");

test("expanded auth screenshots remain loopback-only mocked component evidence", () => {
  assert.match(source, /configFile: false, envFile: false, envDir: false/);
  assert.match(source, /server: \{ host: "127\.0\.0\.1", port: 0/);
  assert.match(source, /if \(url\.origin !== origin\)[\s\S]*return route\.abort\(\)/);
  assert.match(source, /new URL\(page\.url\(\)\)\.origin, origin/);
  assert.match(source, /url\.pathname === "\/api\/auth\/request-password-reset"/);
  assert.match(source, /route\.request\(\)\.postDataJSON\(\)\.identifier, "ui\.fixture"/);
  assert.match(fixture, /view === "forgot"[\s\S]*<ForgotPassword onBackToLogin=/);
});

test("auth fixture seeds a sanitized theme preference before mounting recovery pages", () => {
  assert.match(fixture, /const fixtureTheme = parameters\.get\("theme"\) === "dark" \? "dark" : "light"/);
  assert.match(fixture, /localStorage\.setItem\("theme", fixtureTheme\)/);
  assert.match(fixture, /document\.documentElement\.classList\.toggle\("dark", fixtureTheme === "dark"\)/);
  const preferenceIndex = fixture.indexOf('localStorage.setItem("theme", fixtureTheme)');
  const renderIndex = fixture.indexOf("async function renderHarness()");
  const mountIndex = fixture.indexOf('const root = createRoot(document.getElementById("root"))');
  assert.ok(preferenceIndex >= 0 && renderIndex > preferenceIndex && mountIndex > preferenceIndex,
    "The real useTheme hook must observe the fixture preference on first mount.");
  assert.doesNotMatch(fixture, /localStorage\.setItem\("theme", parameters\.get\("theme"\)\)/,
    "Unvalidated query values cannot become stored theme preferences.");
  assert.match(source, /await expect\.poll\(\(\) => page\.evaluate\(\(\) => document\.documentElement\.classList\.contains\("dark"\)\), \{ timeout: 5_000 \}\)\.toBe\(theme === "dark"\)/,
    "Every navigation must verify the requested theme rather than silently testing light twice.");
});

test("forgot-password state captures retry the enabled localized action after the request error", () => {
  const auth = JSON.parse(readFileSync(new URL("../../client/src/locales/ms/auth.json", import.meta.url), "utf8"));
  assert.equal(auth["v17Recovery.sendRequest"], "Hantar Permintaan");
  assert.equal(auth["v17Recovery.forgotRetry"], "Cuba hantar semula");
  const start = source.indexOf("async function checkAdditionalAuthStateCaptures() {");
  const end = source.indexOf('await go("change", "fixture-link", theme)', start);
  assert.ok(start >= 0 && end > start, "The forgot-password state-capture sequence must remain identifiable.");
  const forgot = source.slice(start, end);
  const errorCapture = forgot.indexOf('await captureAuthState("forgot-request-error", theme)');
  assert.ok(errorCapture >= 0, "Capture the failed request before attempting recovery.");
  const initial = forgot.slice(0, errorCapture);
  const retry = forgot.slice(errorCapture);
  assert.match(initial, /forgotRejection = true;\s*await page\.getByRole\("button", \{ name: "Hantar Permintaan", exact: true \}\)\.click\(\)/,
    "The initial request must use the exact initial localized button.");
  assert.match(retry, /const retryButton = page\.getByRole\("button", \{ name: "Cuba hantar semula", exact: true \}\)/,
    "A rejected request changes the action label; do not weaken the selector to any submit button.");
  assert.match(retry, /await expect\(retryButton\)\.toBeEnabled\(\{ timeout: 5_000 \}\)/,
    "Observe application retry readiness with a bounded assertion before clicking.");
  assert.match(retry, /await retryButton\.click\(\)/);
  assert.doesNotMatch(retry, /name: "Hantar Permintaan"|waitForTimeout|\.catch\s*\(/,
    "Do not reuse the stale label, sleep through readiness, or swallow a failed retry.");

  const orderedSteps = [
    'forgotRejection = false;',
    'markPhase(`forgot/${width}/${theme}: retry readiness`)',
    'const retryButton = page.getByRole("button", { name: "Cuba hantar semula", exact: true })',
    'await expect(retryButton).toBeEnabled({ timeout: 5_000 })',
    'markPhase(`forgot/${width}/${theme}: retry submission`)',
    'await retryButton.click()',
    'await captureAuthState("forgot-pending", theme)',
    'releaseForgot(); forgotResponseGate = null;',
    'markPhase(`forgot/${width}/${theme}: retry completion`)',
    'await visibleText(page.locator("[role=status]"), "Jika akaun wujud")',
    'await captureAuthState("forgot-submitted", theme)',
  ];
  let previousIndex = -1;
  for (const step of orderedSteps) {
    const index = retry.indexOf(step);
    assert.ok(index > previousIndex, `Forgot-password retry must observe this ordered step: ${step}`);
    previousIndex = index;
  }
  const retryPhases = [...retry.matchAll(/markPhase\(([^\r\n]*)\)/g)].map((match) => match[1]);
  assert.deepEqual(retryPhases, [
    '`forgot/${width}/${theme}: retry readiness`',
    '`forgot/${width}/${theme}: retry submission`',
    '`forgot/${width}/${theme}: retry completion`',
  ], "Retry failure phases contain only the view, viewport, theme and fixed state, never identifiers or response data.");
});

test("expanded screenshots mask credential and manual key values while retaining visible labels", () => {
  assert.match(source, /mask: \[page\.locator\('input\[type="password"\], #my-account-two-factor-secret, #my-account-two-factor-code, #login-two-factor-code'\)\]/);
  for (const state of [
    "forgot-ready", "forgot-empty-error", "forgot-pending", "forgot-submitted", "forgot-request-error",
    "change-ready", "change-empty-error", "change-success", "login-otp-ready", "login-otp-invalid",
    "two-factor-off", "two-factor-password", "two-factor-qr", "two-factor-manual", "two-factor-confirm",
    "two-factor-invalid", "two-factor-active", "two-factor-disable-confirm",
  ]) assert.ok(source.includes(`captureAuthState("${state}"`), `${state} is actually captured`);
  assert.match(source, /for \(const width of \[390, 1280\]\)/);
  assert.match(source, /for \(const theme of \["light", "dark"\]\)/);
  assert.match(source, /counts\.disable, beforeDisable, "Cancel never disables 2FA/);
  assert.match(source, /rule IDs\/selectors only, never input values or API data/);
  assert.doesNotMatch(source, /checkContrast|disableRules/);
  assert.match(source, /captureAuthState\("forgot-empty-error", theme\)/);
  assert.match(source, /await document\.fonts\.ready/);
  assert.match(source, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "instant" \}\)/);
  assert.match(source, /fullPage: true, animations: "disabled", caret: "hide"/);
});

test("public password layouts exercise real hover contrast with credential-safe failure phases", () => {
  const start = source.indexOf("async function checkPublicPasswordLayout(");
  const end = source.indexOf("  await server.listen();", start);
  assert.ok(start >= 0 && end > start, "The public-layout assertions remain identifiable with LF or CRLF sources.");
  const layout = source.slice(start, end);
  assert.match(layout, /await visibilityControl\.hover\(\)/);
  assert.match(layout, /element\.matches\(":hover"\)/);
  assert.ok(layout.indexOf("await visibilityControl.hover()") < layout.indexOf("window.axe.run(document"));
  assert.match(layout, /hovered visibility control WCAG A\/AA accessibility/);
  assert.match(layout, /violation\.id, nodes: violation\.nodes\.map\(\(node\) => node\.target\)/);
  assert.doesNotMatch(layout, /disableRules|checkContrast:\s*false|failureSummary/);
});
