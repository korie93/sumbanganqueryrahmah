import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveRedesignBillingFixtureEnabled, resolveRedesignCaptureOptions } from "../frontend-redesign-browser.mjs";
import { validateRedesignSeedEnvironment } from "../fixtures/frontend-redesign-seed.mjs";

const runner = await readFile(new URL("../test-frontend-redesign-isolated.mjs", import.meta.url), "utf8");
const browser = await readFile(new URL("../frontend-redesign-browser.mjs", import.meta.url), "utf8");
const supplement = await readFile(new URL("../fixtures/frontend-redesign-seed.mjs", import.meta.url), "utf8");

test("existing smoke suite runs only in a separate verified disposable app without persistent session artifacts", () => {
  assert.match(runner, /smokeFlag === undefined \|\| smokeFlag === "" \|\| smokeFlag === "0" \|\| smokeFlag === "1"/);
  assert.match(runner, /!smokeOnly \|\| \(!importChecksEnabled && !roleChecksEnabled && !billingFixtureEnabled\)/);
  const branch = runner.slice(runner.indexOf("} else if (smokeOnly) {"), runner.indexOf("await runFrontendRedesignBrowser"));
  assert.match(branch, /scripts\/ui-smoke.mjs/);
  assert.match(branch, /\], appDir, \{/);
  assert.match(branch, /\.\.\.cleanEnv, SMOKE_BASE_URL: baseUrl, SMOKE_TEST_USERNAME: username/);
  assert.doesNotMatch(branch, /SMOKE_ARTIFACTS_DIR|\.\.\.env|\.\.\.process\.env|PG_PASSWORD/);
});

test("redesign fixture cannot inherit an existing application database or credential environment", () => {
  assert.doesNotMatch(runner, /import\s+["']dotenv|\.\.\.process\.env|process\.env\.(?:DATABASE_URL|PG_HOST|PG_PORT|PG_USER|PG_PASSWORD|SESSION_SECRET|SEED_SUPERUSER_PASSWORD)/);
  assert.match(runner, /const cleanEnv = Object\.fromEntries\(inheritedKeys/);
  assert.match(runner, /run\(executable\("initdb"\)/);
  assert.match(runner, /SHOW data_directory/);
  assert.match(runner, /assert\.equal\(await realpath\(state\.rows\[0\]\.data_directory\), await realpath\(dataDir\)\)/);
  assert.match(runner, /CREATE DATABASE sqr_collection_card_test/);
  assert.match(runner, /LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0"/);
  assert.doesNotMatch(runner, /cp\([^\n]*(?:uploads|\.env|receipts)/i);
});

test("existing CI visual contracts are strictly opt-in, exclusive and isolated from dotenv and existing databases", () => {
  assert.match(runner, /visualFlag === undefined \|\| visualFlag === "" \|\| visualFlag === "0" \|\| visualFlag === "1"/);
  assert.match(runner, /!visualOnly \|\| \(!smokeOnly && !importChecksEnabled && !roleChecksEnabled && !realtimeChecksEnabled && !billingFixtureEnabled\)/);
  assert.ok(runner.indexOf("Visual contracts run in their own fresh fixture") < runner.indexOf("const fixtureRoot = await mkdtemp"));
  const branch = runner.slice(runner.indexOf("} else if (visualOnly) {"), runner.indexOf("await runFrontendRedesignBrowser"));
  assert.match(branch, /scripts\/ui-visual-contract\.mjs/);
  assert.match(branch, /\], appDir, \{/);
  assert.match(branch, /await assert\.rejects\(access\(disabledDotenvPath\), \{ code: "ENOENT" \}\)/);
  assert.match(branch, /\.\.\.cleanEnv, NODE_ENV: "test", DOTENV_CONFIG_PATH: disabledDotenvPath/);
  assert.match(branch, /VISUAL_BASE_URL: baseUrl, VISUAL_TEST_USERNAME: username, VISUAL_TEST_PASSWORD: password/);
  assert.match(branch, /VISUAL_ARTIFACTS_DIR: path\.join\(artifactsDir, "ci-visual"\)/);
  assert.match(branch, /PG_HOST: "127\.0\.0\.1", PG_PORT: "1"/);
  assert.doesNotMatch(branch, /\.\.\.env|\.\.\.process\.env|PG_PASSWORD|TWO_FACTOR_ENCRYPTION_KEY|storageState|recordHar|tracing/);
});

test("redesign fixture migrates only its verified fresh database before starting and seeding the real app", () => {
  const verify = runner.indexOf('SHOW data_directory');
  const migrate = runner.indexOf('scripts/db-migrate.mjs');
  const start = runner.indexOf('child = spawn(process.execPath, [builtServer]');
  const seed = runner.indexOf('scripts/fixtures/collection-card-no-seed.ts');
  assert.ok(verify > 0 && migrate > verify && start > migrate && seed > start);
  assert.match(runner, /\{ cwd: appDir, env, windowsHide: true, shell: false/);
  assert.match(runner, /SQR_COLLECTION_CARD_ISOLATED_CLUSTER: "1", SQR_COLLECTION_CARD_DATA_DIR: dataDir/);
  assert.match(runner, /SQR_AUDIT_HMAC_KEY: randomBytes/);
  assert.ok(runner.indexOf("scripts/fixtures/frontend-redesign-seed.mjs") > seed);
});

test("redesign captures use real login, controlled loopback requests, no stored credentials, and the actual logout endpoint", () => {
  assert.doesNotMatch(browser, /dotenv|ui-auth-contract-utils|route\.fulfill|storageState:|recordHar|tracing\.start/);
  assert.match(browser, /new URL\(baseUrl\)\.hostname, "127\.0\.0\.1"/);
  assert.match(browser, /getByTestId\("input-username"\)\.fill\(username\)/);
  assert.match(browser, /\/api\/auth\/login/);
  assert.match(browser, /\/api\/activity\/logout/);
  assert.doesNotMatch(browser, /\/api\/auth\/logout/);
  assert.match(browser, /if \(logoutStatus !== 200\)/);
  assert.match(browser, /route\.abort\(\)/);
  assert.match(browser, /\["light", "dark"\]/);
  assert.match(browser, /document\.documentElement\.dataset\.theme === requestedTheme/);
  assert.match(browser, /appliedTheme: document\.documentElement\.dataset\.theme/);
  assert.match(browser, /assert\.equal\(manifest\.screenshots\.some\(\(screenshot\) => screenshot\.horizontalOverflow\), false/);
});

test("redesign cleanup stops only owned processes and validates a narrow nonsymlink temporary directory", () => {
  assert.match(runner, /child\.send\("shutdown"/);
  assert.match(runner, /if \(appStopped && databaseStopped\)/);
  assert.match(runner, /assert\.equal\(info\.isSymbolicLink\(\), false\)/);
  assert.match(runner, /assert\.equal\(path\.dirname\(resolved\), tempParent\)/);
  assert.match(runner, /assert\.match\(path\.basename\(resolved\), \/\^sqr-collection-card-no-/);
  assert.doesNotMatch(runner, /taskkill|pkill|killall|rm -rf/);
});

test("focused capture accepts only reviewed routes, bounded widths, themes and real workflow checks", () => {
  assert.deepEqual(resolveRedesignCaptureOptions({
    SQR_REDESIGN_ROUTES: "home,general-search,home,collection-summary,collection-monthly",
    SQR_REDESIGN_WIDTHS: "1440,390",
    SQR_REDESIGN_THEMES: "dark",
    SQR_REDESIGN_CHECKS: "shell,search,collection,collection-export,saved,viewer,settings",
  }), { routeIds: ["home", "general-search", "collection-summary", "collection-monthly"], widths: [1440, 390], themes: ["dark"], checks: ["shell", "search", "collection", "collection-export", "saved", "viewer", "settings"] });
  for (const env of [
    { SQR_REDESIGN_ROUTES: "https://example.com" },
    { SQR_REDESIGN_WIDTHS: "-1,390" },
    { SQR_REDESIGN_WIDTHS: "390.5" },
    { SQR_REDESIGN_WIDTHS: "10000" },
    { SQR_REDESIGN_THEMES: "unknown" },
    { SQR_REDESIGN_CHECKS: "arbitrary-script" },
  ]) assert.throws(() => resolveRedesignCaptureOptions(env));
});

test("default captures retain the full matrix and expanded final widths", () => {
  const normal = resolveRedesignCaptureOptions();
  assert.equal(normal.routeIds.length, 17);
  assert.deepEqual(normal.themes, ["light", "dark"]);
  assert.deepEqual(normal.widths, [1440, 390, 1024, 768, 430, 360]);
  assert.deepEqual(normal.checks, []);
  const final = resolveRedesignCaptureOptions({}, true);
  assert.ok(final.widths.includes(320) && final.widths.includes(1280));
  assert.deepEqual(final.routeIds, normal.routeIds);
});

test("Billing supplement is strictly opt-in and does not change default capture options", () => {
  for (const value of [undefined, "", "0"]) assert.equal(resolveRedesignBillingFixtureEnabled({ SQR_REDESIGN_BILLING_FIXTURE: value }), false);
  assert.equal(resolveRedesignBillingFixtureEnabled({ SQR_REDESIGN_BILLING_FIXTURE: "1" }), true);
  for (const value of [true, 1, "true", "yes", " 1", "2"]) assert.throws(() => resolveRedesignBillingFixtureEnabled({ SQR_REDESIGN_BILLING_FIXTURE: value }));
  assert.deepEqual(resolveRedesignCaptureOptions({ SQR_REDESIGN_BILLING_FIXTURE: "1" }), resolveRedesignCaptureOptions());
});

test("opt-in Billing receives only fresh private identity once after actual successful login", () => {
  const callback = runner.slice(runner.indexOf("const prepareBillingFixture ="), runner.indexOf("if (roleChecksEnabled)"));
  assert.match(callback, /billingFixtureEnabled \? \(page\) => prepareRedesignBillingFixture/);
  assert.match(callback, /SQR_REDESIGN_ISOLATED_CLUSTER: "1", SQR_REDESIGN_DATA_DIR: dataDir/);
  assert.match(callback, /PG_PASSWORD: env\.PG_PASSWORD/);
  assert.doesNotMatch(callback, /\.\.\.env|\.\.\.process\.env|SESSION_SECRET|SEED_SUPERUSER_PASSWORD|SEED_ADMIN_PASSWORD/);
  const login = browser.indexOf("loginSucceeded = true");
  const supplement = browser.indexOf("billingFixture = await prepareBillingFixture(page)");
  const captures = browser.indexOf("for (const route of selectedRoutes)");
  assert.ok(login > 0 && supplement > login && captures > supplement);
  assert.match(browser, /if \(prepareBillingFixture && !billingFixture\)/);
  const manifestAssignment = browser.slice(browser.indexOf("manifest.billingFixture ="), browser.indexOf("manifest.billingFixture =") + 210);
  assert.match(manifestAssignment, /evidence: billingFixture\.evidence/);
  assert.doesNotMatch(manifestAssignment, /env|password|prepareBillingFixture|targetId|revisionId/);
});

test("populated Billing and Daily are selected through real controls and keep the original record proof", () => {
  assert.match(browser, /targetSelect\.selectOption\(fixture\.targetId\)/);
  assert.match(browser, /numberAt\(allA, 1\), 10500/);
  assert.match(browser, /numberAt\(allA, 5\), 10000/);
  assert.match(browser, /numberAt\(allB, 5\), 2100/);
  assert.match(browser, /count\(\), 31, "Billing calendar retains every configured August day"/);
  assert.match(browser, /getByRole\("checkbox", \{ name: fixture\.nickname, exact: true \}\)\.check\(\)/);
  assert.match(browser, /url\.searchParams\.get\("usernames"\)\?\.toLowerCase\(\) === fixture\.nickname\.toLowerCase\(\)/);
  assert.match(browser, /Number\(payload\.summary\.collectedToDate\), 2100/);
  assert.match(browser, /getByTestId\("collection-daily-refresh"\)\.click\(\)/);
  assert.match(browser, /page\.locator\("\.ops-section-card"\)\.filter\(\{ has: page\.getByRole\("heading", \{ name: "Daily Performance Summary", exact: true \}\) \}\)/);
  assert.doesNotMatch(browser, /getByTestId\("collection-daily-summary"\)/);
  assert.match(browser, /if \(billingFixture\) await scopeOriginalCollectionRecords\(page, width\)/);
  assert.match(browser, /getByRole\("table", \{ name: "Monthly collection totals", exact: true \}\)/);
  assert.match(browser, /september\.getByRole\("cell", \{ name: "59", exact: true \}\)/);
});

test("supplemental nickname seed rejects inherited, remote, nonfixture and broad database targets", () => {
  const tempParent = path.resolve(os.tmpdir());
  const env = {
    SQR_REDESIGN_ISOLATED_CLUSTER: "1", PG_HOST: "127.0.0.1", PG_DATABASE: "sqr_collection_card_test",
    PG_USER: "sqr_fixture", PG_PORT: "12345", SEED_SUPERUSER_USERNAME: "collectioncardfixture123456abcdef",
    SQR_REDESIGN_DATA_DIR: path.join(tempParent, "sqr-collection-card-no-Ab12Cd", "postgres"),
  };
  assert.equal(validateRedesignSeedEnvironment(env, tempParent).dataDir, env.SQR_REDESIGN_DATA_DIR);
  for (const changed of [
    { SQR_REDESIGN_ISOLATED_CLUSTER: "0" }, { PG_HOST: "production.example" },
    { PG_DATABASE: "sqr_db" }, { PG_USER: "postgres" }, { DATABASE_URL: "postgresql://localhost/existing" },
    { PG_PORT: "0" }, { PG_PORT: "65536" }, { PG_PORT: "123.5" },
    { SEED_SUPERUSER_USERNAME: "existing-user" }, { SQR_REDESIGN_DATA_DIR: tempParent },
    { SQR_REDESIGN_DATA_DIR: path.join(tempParent, "existing-app", "postgres") },
    { SQR_REDESIGN_DATA_DIR: path.join(tempParent, "nested", "sqr-collection-card-no-Ab12Cd", "postgres") },
  ]) assert.throws(() => validateRedesignSeedEnvironment({ ...env, ...changed }, tempParent));
});

test("supplement verifies actual cluster identity and synthetic provenance before inserting one nickname", () => {
  assert.doesNotMatch(supplement, /(?:from|import)\s*["'][^"']*(?:dotenv|db-postgres)|DELETE FROM|UPDATE collection/);
  assert.match(supplement, /state\.isSymbolicLink\(\), false/);
  const verify = supplement.indexOf("SHOW data_directory");
  const identity = supplement.indexOf("SELECT current_database()");
  const provenance = supplement.indexOf("records.rows[0].count, 59");
  const empty = supplement.indexOf("nicknames.rows[0].count, 0");
  const insert = supplement.indexOf("INSERT INTO collection_staff_nicknames");
  assert.ok(verify > 0 && identity > verify && provenance > identity && empty > provenance && insert > empty);
  assert.match(supplement, /'Fixture Collector',true,'both'/);
  assert.match(supplement, /connection\.query\("ROLLBACK"\)/);
  assert.match(supplement, /await connection\.end\(\)/);
});

test("full Collection captures use real nickname controls, data responses and downloadable exports", () => {
  assert.match(browser, /selectFixtureNickname\(page, "save-collection-superuser-nickname"\)/);
  assert.match(browser, /#save-collection-customer-name/);
  assert.match(browser, /#collection-summary-year-filter"\)\.selectOption\("2026"\)/);
  assert.match(browser, /payload\.summary\.find\(\(month\) => month\.month === 9\)\?\.totalRecords, 59/);
  assert.match(browser, /payload\.months\.find\(\(month\) => month\.month === "2026-09"\)\?\.recordCount, 59/);
  assert.match(browser, /page\.waitForEvent\("download"\)/);
  assert.match(browser, /download\.createReadStream\(\)/);
  assert.match(browser, /await download\.delete\(\)/);
  assert.match(browser, /"PK" : "%PDF-"/);
});

test("Viewer real checks cover sheet focus, reversible column controls, overflow fields and pagination overlap", () => {
  assert.match(browser, /async function verifyViewer\(/);
  assert.match(browser, /await cardColumn\.setChecked\(wasChecked\)/);
  assert.match(browser, /Viewer mobile filters restore launcher focus/);
  assert.match(browser, /Viewer additional fields remain keyboard accessible/);
  assert.match(browser, /footerBounds\.y >= dataBounds\.y \+ dataBounds\.height - 1/);
  assert.match(browser, /getByRole\("navigation", \{ name: "Dataset pagination", exact: true \}\)/);
  assert.match(browser, /Viewer More menu restores launcher focus without clearing data/);
});

test("Settings captures resolve real category metadata and exercise actual navigation and nonmutating role inspection", () => {
  assert.match(browser, /fetch\("\/api\/settings", \{ credentials: "include" \}\)/);
  assert.match(browser, /payload\.categories\?\.find\(\(entry\) => entry\.name === "Roles & Permissions"\)/);
  assert.match(browser, /navigation\.getByRole\("button", \{ name: \/\^Roles & Permissions/);
  assert.match(browser, /url\.searchParams\.get\("section"\) === category\.id/);
  assert.match(browser, /Settings section menu Escape restores launcher focus/);
  assert.match(browser, /Read-only permission inspection does not create unsaved changes/);
  assert.match(browser, /Role Comparison starts collapsed so role controls remain primary/);
  assert.match(browser, /await comparisonToggle\.press\("Enter"\)/);
  assert.match(browser, /Role Comparison retains keyboard focus/);
  assert.match(browser, /filteredComparisonRows > 0 && filteredComparisonRows < totalComparisonRows/);
  assert.match(browser, /Clearing permission search restores all comparison modules/);
  assert.match(browser, /captureSection\("settings-role-comparison-expanded", comparison, width\)/);
  assert.doesNotMatch(browser, /fetch\("\/api\/settings",[^\n]*method: "(?:PATCH|POST)"/);
});

test("Monitor and Activity checks use actual menus, cancel confirmations and retain protected-role controls", () => {
  assert.deepEqual(resolveRedesignCaptureOptions({ SQR_REDESIGN_CHECKS: "monitor,activity" }).checks, ["monitor", "activity"]);
  assert.match(browser, /Synthetic superuser retains all five allowed monitor sections/);
  assert.match(browser, /Monitor Escape restores current section trigger/);
  assert.match(browser, /Activity never offers Ban for synthetic superuser/);
  assert.match(browser, /Activity investigation Escape restores original row trigger/);
  assert.match(browser, /Investigation \$\{action\} cancellation restores original row trigger/);
  assert.doesNotMatch(browser, /getByTestId\(["'`]button-confirm-(?:kick|ban|delete)/);
});

test("special Settings deep links wait for real bootstrap and allow later category navigation without mutations", () => {
  assert.deepEqual(resolveRedesignCaptureOptions({ SQR_REDESIGN_CHECKS: "settings-deep-links" }).checks, ["settings-deep-links"]);
  const workflow = browser.slice(browser.indexOf("async function verifySettingsDeepLinks("), browser.indexOf("async function verifyMonitor("));
  assert.match(workflow, /\["backup-restore", "Backup & Restore"/);
  assert.match(workflow, /\["account-management", "Account Management"/);
  assert.match(workflow, /getByText\("User Account Management", \{ exact: true \}\)/);
  assert.match(workflow, /getByRole\("heading", \{ level: 1, name: heading, exact: true \}\)/);
  assert.match(workflow, /error\.redesignStep \?\?= deepLinkStep/);
  assert.ok(workflow.indexOf("page.waitForResponse") < workflow.indexOf("page.goto"));
  assert.match(workflow, /await response\.finished\(\)/);
  assert.match(workflow, /payload\.categories\?\.find/);
  assert.match(workflow, /\["General", "Security"\]/);
  assert.match(workflow, /await page\.getByTestId\("two-factor-settings"\)\.count\(\), 0/);
  assert.match(workflow, /await page\.locator\("#my-account-new-password"\)\.count\(\), 0/);
  assert.match(workflow, /Applied deep link does not pin later category navigation/);
  assert.match(workflow, /Deep-link category change restores mobile launcher focus/);
  assert.match(workflow, /Save Changes.*isDisabled\(\), true/);
  assert.doesNotMatch(workflow, /\.fill\(|\.check\(|route\.fulfill|method:\s*"(?:POST|PUT|PATCH|DELETE)"|localStorage\.setItem/);
});

test("failed Roles diagnostics record the exact safe step and remove input values from main-only HTML", () => {
  assert.match(browser, /settingsStep = "wait for selected category URL"/);
  assert.match(browser, /error\.redesignSettingsState = await page\.evaluate/);
  assert.match(browser, /page\.locator\("main#main-content"\)\.evaluate/);
  assert.match(browser, /input\.removeAttribute\("value"\)/);
  assert.match(browser, /textarea\.textContent = ""/);
  assert.match(browser, /script\.remove\(\)/);
  assert.doesNotMatch(browser, /page\.content\(\)|JSON\.stringify\(error\)/);
});

test("Daily section evidence stays bounded and checks real keyboard disclosures without changing calendar data", () => {
  assert.deepEqual(resolveRedesignCaptureOptions({ SQR_REDESIGN_CHECKS: "daily" }).checks, ["daily"]);
  assert.match(browser, /assert\.ok\(billingFixture, "Daily disclosure workflow requires the opt-in synthetic Billing fixture"\)/);
  assert.match(browser, /bounds\.height <= 1800/);
  assert.match(browser, /await locator\.screenshot\(/);
  assert.match(browser, /manifest\.sectionScreenshots\.push/);
  assert.match(browser, /Daily attention warning stays outside optional disclosures/);
  assert.match(browser, /Daily filter and display controls remain directly available/);
  assert.match(browser, /await toggle\.press\("Enter"\)/);
  assert.match(browser, /Read-only disclosures do not create calendar changes/);
  assert.match(browser, /range\.getClientRects\(\)/);
  assert.match(browser, /layout\.lineCount, 1/);
  assert.match(browser, /layout\.scrollWidth <= layout\.clientWidth \+ 1/);
  assert.match(browser, /assertAmountsFit\(disclosure\.locator\("\.ops-metric-value"\)\)/);
  const workflow = browser.slice(browser.indexOf("async function verifyDaily("), browser.indexOf("async function verifySaved("));
  assert.doesNotMatch(workflow, /\.fill\(|\.check\(|\.selectOption\(|\.click\(/);
  assert.match(workflow, /Apply to selected days.*isDisabled\(\), true/);
});

test("optional accessibility inspects captured real UI and fails on every WCAG violation severity", () => {
  assert.deepEqual(resolveRedesignCaptureOptions({ SQR_REDESIGN_CHECKS: "a11y,shell" }).checks, ["a11y", "shell"]);
  assert.match(browser, /const result = await runRedesignAccessibility\(page\)/);
  assert.match(browser, /manifest\.accessibility\.push\(\{ id, theme, width, \.\.\.result \}\)/);
  assert.match(browser, /checks\.filter\(\(entry\) => entry !== "a11y"\)/);
  assert.match(browser, /unresolvedViolationCount, 0/);
  assert.match(browser, /automatedViolationCount: manifest\.accessibility\.reduce/);
  assert.doesNotMatch(browser, /violations\.filter\([^\n]*(?:critical|serious)/);
});

test("each reviewed modal menu proves trigger ownership and real keyboard containment without DOM changes", () => {
  const review = browser.slice(browser.indexOf("async function verifyModalMenuKeyboard("), browser.indexOf("async function verifyShell("));
  assert.match(review, /openTrigger\.getAttribute\("id"\)/);
  assert.match(review, /const trigger = page\.locator\(`button\[id=\$\{JSON\.stringify\(triggerId\)\}\]`\)/);
  assert.match(review, /trigger\.getAttribute\("aria-haspopup"\), "menu"/);
  assert.match(review, /await page\.keyboard\.press\("Tab"\)/);
  assert.match(review, /await page\.keyboard\.press\("Shift\+Tab"\)/);
  assert.match(review, /await page\.keyboard\.press\("Escape"\)/);
  assert.match(review, /await assertFocus\(page, trigger/);
  assert.match(review, /await trigger\.press\("Enter"\)/);
  assert.match(review, /await assertFocusWithin\(page, menu/);
  assert.doesNotMatch(review, /setAttribute|\.style|tabIndex\s*=|\.focus\(|route\.fulfill/);
  assert.match(browser, /raw axe findings retained/);
});

test("shell resize check inspects the real modal and visible desktop focus without changing DOM", () => {
  assert.match(browser, /capture\("shell-mobile-to-desktop", 1024\)/);
  assert.match(browser, /Mobile navigation closes when desktop navigation becomes available/);
  assert.match(browser, /Resize restores focus to the visible desktop navigation control/);
  assert.match(browser, /Resizing out of mobile navigation releases modal pointer lock/);
  assert.match(browser, /page\.emulateMedia\(\{ reducedMotion: "no-preference" \}\)/);
  assert.match(browser, /finally \{ await page\.emulateMedia\(\{ reducedMotion: "reduce" \}\); \}/);
  assert.match(browser, /Normal-motion navigation restores launcher focus/);
});

test("mobile Collection capture verifies button children as well as document overflow", () => {
  assert.match(browser, /async function assertButtonContentsFit\(/);
  assert.match(browser, /document\.createTreeWalker\(element, NodeFilter\.SHOW_TEXT\)/);
  assert.match(browser, /contents\.push\(\.\.\.range\.getClientRects\(\)\)/);
  assert.match(browser, /element\.children\].map\(\(child\) => child\.getBoundingClientRect\(\)\)/);
  assert.match(browser, /assert\.equal\(layout\.outsideCount, 0/);
  assert.match(browser, /id === "collection-records" && width < 768/);
  assert.match(browser, /keeps icon, label and count inside the button/);
  const check = browser.slice(browser.indexOf("async function assertButtonContentsFit("), browser.indexOf("async function verifyShell("));
  assert.doesNotMatch(check, /\.style\.|setAttribute\(|textContent\s*=/);
  const preparation = browser.slice(browser.indexOf("async function scopeOriginalCollectionRecords("), browser.indexOf("async function prepareCollectionSave("));
  assert.doesNotMatch(preparation, /name: "Search & Filters", exact: true \}\)\.click/);
  assert.match(preparation, /error\.redesignStep = step/);
  assert.match(preparation, /wait original 59 records/);
  assert.match(preparation, /sheet\.getByRole\("button", \{ name: "Close", exact: true \}\)\.click\(\)/);
  assert.doesNotMatch(preparation, /keyboard\.press\("Escape"\)/);
});
