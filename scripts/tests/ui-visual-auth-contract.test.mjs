import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const visualContractSource = readFileSync(
  path.join(repoRoot, "scripts", "ui-visual-contract.mjs"),
  "utf8",
);
const accessibilityContractSource = readFileSync(
  path.join(repoRoot, "scripts", "ui-accessibility-contract.mjs"),
  "utf8",
);
const authContractUtilsSource = readFileSync(
  path.join(repoRoot, "scripts", "ui-auth-contract-utils.mjs"),
  "utf8",
);
const loginPageSource = readFileSync(
  path.join(repoRoot, "client", "src", "pages", "Login.tsx"),
  "utf8",
);

test("visual contract authenticated login follows the stable login test ids", () => {
  assert.match(visualContractSource, /getByTestId\("input-username"\)\.fill\(authUsername\)/);
  assert.match(visualContractSource, /getByTestId\("input-password"\)\.fill\(authPassword\)/);
  assert.match(visualContractSource, /getByTestId\("button-login"\)\.click\(\)/);
});

test("visual contract keeps the login page reachability helper aligned with the login form", () => {
  assert.match(authContractUtilsSource, /const ensureLoginPageVisible = async \(page, contextLabel = "Authenticated contract"\) =>/);
  assert.match(visualContractSource, /contentSelector: "\.login-shell"/);
  assert.match(visualContractSource, /if \(routeSpec\.path === "\/login"\) {\s+await ensureLoginPageVisible\(page, `\$\{routeSpec\.id\}\/\$\{viewportSpec\.id\}`\);\s+}/);
  assert.match(authContractUtilsSource, /Log Masuk SQR/);
  assert.match(authContractUtilsSource, /Log In SQR System/);
  assert.match(authContractUtilsSource, /getByTestId\("input-username"\)/);
  assert.match(authContractUtilsSource, /await usernameInput\.waitFor\(\{ state: "visible", timeout: 10_000 \}\)/);
  assert.match(loginPageSource, /data-testid="input-username"/);
  assert.match(loginPageSource, /data-testid="input-password"/);
  assert.match(loginPageSource, /data-testid="button-login"/);
});

test("visual and accessibility contracts verify the session through /api/me before authenticated route checks", () => {
  assert.match(visualContractSource, /probeAuthSession/);
  assert.match(visualContractSource, /waitForAuthenticatedShell/);
  assert.match(visualContractSource, /await page\.goto\(`\$\{baseUrl\}\/`, \{ waitUntil: "networkidle" \}\)/);
  assert.match(visualContractSource, /completeTwoFactorLoginIfNeeded/);
  assert.match(authContractUtilsSource, /getByTestId\("input-two-factor-code"\)/);
  assert.match(authContractUtilsSource, /\/api\/auth\/verify-two-factor-login/);
  assert.match(authContractUtilsSource, /TWO_FACTOR_ENCRYPTION_KEY is required/);
  assert.match(authContractUtilsSource, /button-user-menu/);
  assert.match(authContractUtilsSource, /button-open-mobile-nav/);
  assert.match(authContractUtilsSource, /Sahkan Kod/i);

  assert.match(accessibilityContractSource, /probeAuthSession/);
  assert.match(accessibilityContractSource, /getByTestId\("input-username"\)\.fill\(authUsername\)/);
  assert.match(accessibilityContractSource, /getByTestId\("input-password"\)\.fill\(authPassword\)/);
  assert.match(accessibilityContractSource, /getByTestId\("button-login"\)\.click\(\)/);
  assert.match(accessibilityContractSource, /completeTwoFactorLoginIfNeeded/);
  assert.match(accessibilityContractSource, /waitForAuthenticatedShell/);
});

test("accessibility contract ignores clipped focus guards from portal libraries", () => {
  assert.match(accessibilityContractSource, /const isVisuallyHiddenFocusableUtility = \(element, style, rect\) =>/);
  assert.match(accessibilityContractSource, /normalizedClip === "rect\(0px,0px,0px,0px\)"/);
  assert.match(accessibilityContractSource, /normalizedClipPath\.includes\("inset\(50%\)"\)/);
  assert.match(accessibilityContractSource, /rect\.width <= 1/);
  assert.match(accessibilityContractSource, /rect\.height <= 1/);
});
