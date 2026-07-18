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
const operationalContractMatrixSource = readFileSync(
  path.join(repoRoot, "scripts", "lib", "ui-operational-contract-matrix.mjs"),
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
  assert.match(visualContractSource, /submitPasswordLoginWithRetry/);
  assert.match(authContractUtilsSource, /export const submitPasswordLoginWithRetry = async \(page,/);
  assert.match(authContractUtilsSource, /getByTestId\("input-username"\)\.fill\(username\)/);
  assert.match(authContractUtilsSource, /getByTestId\("input-password"\)\.fill\(password\)/);
  assert.match(authContractUtilsSource, /getByTestId\("button-login"\)\.click\(\)/);
  assert.match(authContractUtilsSource, /lastLoginResponse\.status\(\) !== 429/);
  assert.match(authContractUtilsSource, /const retryLabel = \/\\blogin\\b\/i\.test\(contextLabel\)/);
  assert.doesNotMatch(authContractUtilsSource, /\$\{contextLabel\} login was rate limited/);
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

test("visual contract guards dashboard recent activity across browser zoom widths", () => {
  assert.match(
    visualContractSource,
    /id: "dashboard"[\s\S]*scrollSelector: "#dashboard-recent-login-activity"[\s\S]*readySelector: "\[data-testid='card-recent-login-activity'\]"/,
  );
  assert.match(visualContractSource, /scrollIntoViewIfNeeded\(\)/);
  assert.match(visualContractSource, /const dashboardZoomViewportSpecs = \[/);
  assert.match(visualContractSource, /\{ id: "zoom-in", width: 800, height: 900 \}/);
  assert.match(visualContractSource, /\{ id: "short-desktop", width: 1280, height: 600 \}/);
  assert.match(visualContractSource, /\{ id: "zoom-out-boundary", width: 1536, height: 900 \}/);
  assert.match(visualContractSource, /\{ id: "zoom-out", width: 1920, height: 900 \}/);
  assert.match(visualContractSource, /ready\.scrollWidth/);
  assert.match(visualContractSource, /protected surface has internal horizontal overflow/);
  assert.match(visualContractSource, /async function verifyDashboardRecentActivityDetailLayout/);
  assert.match(visualContractSource, /recent-login-activity-detail-sheet/);
  assert.match(visualContractSource, /await page\.waitForFunction/);
  assert.match(visualContractSource, /document\.activeElement\.dataset\.testid === nextTestId/);
  assert.match(visualContractSource, /recent activity detail has internal horizontal overflow/);
  assert.match(visualContractSource, /recent activity detail did not return focus to its trigger/);
  assert.match(visualContractSource, /async function verifyDashboardCleanupDialogLayout/);
  assert.match(visualContractSource, /element\.contains\(document\.activeElement\)/);
  assert.match(visualContractSource, /getByRole\("button", \{ name: "Cancel" \}\)\.click\(\)/);
  assert.match(visualContractSource, /cleanup dialog has internal horizontal overflow/);
  assert.match(visualContractSource, /cleanup dialog did not return focus to its trigger/);
  assert.match(visualContractSource, /async function verifyDashboardReviewSidebarLayout/);
  assert.match(visualContractSource, /await sidebar\.scrollIntoViewIfNeeded\(\)/);
  assert.match(visualContractSource, /review sidebar escaped the viewport height/);
  assert.match(visualContractSource, /tall review sidebar is not internally scrollable/);
  assert.match(visualContractSource, /async function verifyDashboardChartDetailLayout/);
  assert.match(visualContractSource, /button-expand-login-trends/);
  assert.match(visualContractSource, /button-expand-peak-hours/);
  assert.match(visualContractSource, /for \(const chartSpec of dashboardChartDetailSpecs\)/);
  assert.match(visualContractSource, /getByRole\("button", \{ name: "Close" \}\)\.click\(\)/);
  assert.match(visualContractSource, /detail has internal horizontal overflow/);
  assert.match(visualContractSource, /detail did not return focus to its trigger/);
  assert.match(
    visualContractSource,
    /await verifyRouteLayout\(page, dashboardRouteSpec, viewportSpec\);\s+await verifyDashboardReviewSidebarLayout\(page, viewportSpec\);\s+await verifyDashboardRecentActivityDetailLayout\(page, viewportSpec\);\s+await verifyDashboardCleanupDialogLayout\(page, viewportSpec\);\s+await verifyDashboardChartDetailLayout\(page, viewportSpec\)/,
  );
});

test("visual and accessibility contracts verify the session through /api/me before authenticated route checks", () => {
  assert.match(visualContractSource, /probeAuthSession/);
  assert.match(visualContractSource, /waitForAuthenticatedShell/);
  assert.match(visualContractSource, /const navigateForVisualContract = async \(page, routePath\) =>/);
  assert.match(visualContractSource, /waitUntil: "domcontentloaded"/);
  assert.match(visualContractSource, /await navigateForVisualContract\(page, "\/"\)/);
  assert.match(visualContractSource, /completeTwoFactorLoginIfNeeded/);
  assert.match(authContractUtilsSource, /getByTestId\("input-two-factor-code"\)/);
  assert.match(authContractUtilsSource, /\/api\/auth\/verify-two-factor-login/);
  assert.match(authContractUtilsSource, /TWO_FACTOR_ENCRYPTION_KEY is required/);
  assert.match(authContractUtilsSource, /button-user-menu/);
  assert.match(authContractUtilsSource, /button-open-mobile-nav/);
  assert.match(authContractUtilsSource, /Sahkan Kod/i);

  assert.match(accessibilityContractSource, /probeAuthSession/);
  assert.match(accessibilityContractSource, /submitPasswordLoginWithRetry/);
  assert.match(accessibilityContractSource, /completeTwoFactorLoginIfNeeded/);
  assert.match(accessibilityContractSource, /waitForAuthenticatedShell/);
  assert.match(accessibilityContractSource, /const navigateForAccessibilityContract = async \(page, routePath\) =>/);
  assert.match(accessibilityContractSource, /waitUntil: "domcontentloaded"/);
  assert.match(accessibilityContractSource, /await navigateForAccessibilityContract\(page, "\/"\)/);
});

test("accessibility contract covers core authenticated work surfaces", () => {
  assert.match(accessibilityContractSource, /id: "dashboard"[\s\S]*path: "\/dashboard"/);
  assert.match(accessibilityContractSource, /id: "dashboard"[\s\S]*contentSelector: '\[data-testid="text-dashboard-title"\]'/);
  assert.match(accessibilityContractSource, /id: "settings"[\s\S]*path: "\/settings"/);
  assert.match(operationalContractMatrixSource, /id: "import"[\s\S]*path: "\/import"/);
  assert.match(accessibilityContractSource, /import \{ operationalContractRouteSpecs \}/);
  assert.match(accessibilityContractSource, /\.\.\.operationalContractRouteSpecs/);
  assert.match(
    accessibilityContractSource,
    /if \(routeSpec\.readySelector\) \{\s+await page\.locator\(routeSpec\.readySelector\)\.first\(\)\.waitFor\(\{ timeout: 15_000 \}\);\s+\}/,
  );
  assert.match(visualContractSource, /operationalContractRouteSpecs/);
  assert.match(visualContractSource, /\.\.\.operationalContractRouteSpecs/);
});

test("accessibility contract includes screen-reader interaction scenarios", () => {
  assert.match(accessibilityContractSource, /verifyLoginFormErrorAnnouncement/);
  assert.match(accessibilityContractSource, /#login-username-error\[role='alert'\]/);
  assert.match(accessibilityContractSource, /aria-describedby/);
  assert.match(accessibilityContractSource, /verifyFloatingAiScreenReaderScenario/);
  assert.match(accessibilityContractSource, /data-floating-ai-dialog="true"\]\[role="dialog"\]/);
  assert.match(accessibilityContractSource, /\[role="log"\]\[aria-live="polite"\]/);
  assert.match(accessibilityContractSource, /floating AI Escape should return focus to the trigger/);
});

test("accessibility contract ignores clipped focus guards from portal libraries", () => {
  assert.match(accessibilityContractSource, /const isVisuallyHiddenFocusableUtility = \(element, style, rect\) =>/);
  assert.match(accessibilityContractSource, /normalizedClip === "rect\(0px,0px,0px,0px\)"/);
  assert.match(accessibilityContractSource, /normalizedClipPath\.includes\("inset\(50%\)"\)/);
  assert.match(accessibilityContractSource, /rect\.width <= 1/);
  assert.match(accessibilityContractSource, /rect\.height <= 1/);
});
