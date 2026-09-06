import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const smokeSource = readFileSync(
  path.join(repoRoot, "scripts", "ui-smoke.mjs"),
  "utf8",
);

test("UI smoke navigation avoids networkidle for authenticated SPA routes", () => {
  assert.match(smokeSource, /const navigateForSmoke = async \(page, routeOrUrl\) =>/);
  assert.match(smokeSource, /waitUntil: "domcontentloaded"/);
  assert.match(smokeSource, /const waitForSmokeDocumentReady = async \(page\) =>/);
  assert.match(smokeSource, /timeout: SMOKE_LOAD_STATE_TIMEOUT_MS/);
  assert.doesNotMatch(smokeSource, /networkidle/);
});

test("UI smoke bounds the landing login click and falls back to the canonical login route", () => {
  assert.match(
    smokeSource,
    /const loginHeading = page\.locator\("h1\.login-title"\)\.first\(\);/,
  );
  assert.match(
    smokeSource,
    /page\.locator\("html\.app-ready"\)\.waitFor\(\{\s+state: "attached",\s+timeout: SMOKE_NAVIGATION_TIMEOUT_MS,\s+\}\)/,
  );
  assert.match(
    smokeSource,
    /publicLoginButton\.click\(\{ force: true, timeout: 5_000 \}\)/,
  );
  assert.match(
    smokeSource,
    /if \(page\.isClosed\(\)\) \{\s+throw error;\s+\}/,
  );
  assert.match(
    smokeSource,
    /await navigateForSmoke\(page, "\/login"\);\s+await waitForInteractiveLogin\(\);/,
  );
});

test("UI smoke pairs login submission with its response without a dangling rejection", () => {
  assert.match(
    smokeSource,
    /const \[loginResponse\] = await Promise\.all\(\[\s+page\.waitForResponse\(/,
  );
  assert.match(
    smokeSource,
    /page\.getByTestId\("button-login"\)\.click\(\),\s+\]\);/,
  );
  assert.doesNotMatch(smokeSource, /const loginResponsePromise = page\.waitForResponse/);
});

test("collection receipt smoke configures a governed source before automatic matching", () => {
  const sourceConfigIndex = smokeSource.indexOf(
    '`/api/collection/source-configs/${encodeURIComponent(sourceImportId)}`',
  );
  const sourceMatchIndex = smokeSource.indexOf(
    'page.getByRole("button", { name: "Semak Auto-matching" }).click()',
  );
  const createWaitIndex = smokeSource.indexOf("const createResponsePromise", sourceMatchIndex);
  const saveIndex = smokeSource.indexOf(
    'page.getByRole("button", { name: "Save Collection" }).click()',
    createWaitIndex,
  );

  assert.match(smokeSource, /"TOTAL DUE": String\(values\.totalDue \?\? "12\.34"\)/);
  assert.match(
    smokeSource,
    /"Billing Principal \(OSP\)": String\(values\.billingPrincipalOsp \?\? "10\.00"\)/,
  );
  assert.match(
    smokeSource,
    /"Calling Date": String\(values\.callingDate \?\? getLocalIsoDate\(\)\)/,
  );
  assert.match(smokeSource, /"DC_STS": String\(values\.dcSts \?\? "6"\)/);
  assert.match(
    smokeSource,
    /new URL\(response\.url\(\)\)\.pathname === "\/api\/collection\/source-matches"/,
  );
  assert.match(smokeSource, /validFrom: values\.validFrom \?\? "2000-01-01"/);
  assert.match(smokeSource, /validTo: values\.validTo \?\? "2099-12-31"/);
  assert.doesNotMatch(smokeSource, /save-collection-source-file/);
  assert.doesNotMatch(smokeSource, /getByLabel\("Aging"/);
  assert.match(smokeSource, /page\.getByText\("Abort CP", \{ exact: true \}\)/);
  assert.match(smokeSource, /String\(matchedSource\.projectedCumulative \|\| ""\) === "12\.34"/);
  assert.ok(sourceConfigIndex >= 0 && sourceConfigIndex < sourceMatchIndex);
  assert.ok(sourceMatchIndex >= 0 && sourceMatchIndex < createWaitIndex);
  assert.ok(createWaitIndex < saveIndex);
});

test("direct collection smoke fixtures create and clean verified Saved sources", () => {
  const mutationStart = smokeSource.indexOf("const checkCollectionMutationConsistency = async");
  const mutationEnd = smokeSource.indexOf("const checkCollectionRecordsStaleDeleteConflict", mutationStart);
  const mutationSource = smokeSource.slice(mutationStart, mutationEnd);
  const staleFixtureStart = smokeSource.indexOf("const provisionStaleDeleteConflictRecord = async");
  const staleFixtureEnd = smokeSource.indexOf("const waitForRateLimitRecovery", staleFixtureStart);
  const staleFixtureSource = smokeSource.slice(staleFixtureStart, staleFixtureEnd);

  assert.ok(mutationStart >= 0 && mutationEnd > mutationStart);
  assert.ok(staleFixtureStart >= 0 && staleFixtureEnd > staleFixtureStart);
  assert.match(mutationSource, /createCollectionSmokeSourceImport\(context,/);
  assert.match(mutationSource, /sourceImportId: sourceImport\.id/);
  assert.match(mutationSource, /cleanup collection mutation source import/);
  assert.match(staleFixtureSource, /createCollectionSmokeSourceImport\(context,/);
  assert.match(staleFixtureSource, /sourceImportId: sourceImport\.id/);
  assert.match(staleFixtureSource, /cleanup failed stale-delete source import/);
});

test("collection receipt smoke explicitly selects the superuser nickname before filling and verifies saved attribution", () => {
  const flowStart = smokeSource.indexOf("const checkCollectionReceiptUiFlow = async");
  const flowEnd = smokeSource.indexOf("const checkBackupRestoreUiFlow = async", flowStart);
  const flowSource = smokeSource.slice(flowStart, flowEnd);

  assert.ok(flowStart >= 0 && flowEnd > flowStart);
  const navigateIndex = flowSource.indexOf('await navigateForSmoke(page, "/collection/save")');
  const pickerIndex = flowSource.indexOf('page.locator("#save-collection-superuser-nickname")');
  const emptyFormIndex = flowSource.indexOf('page.locator("#save-collection-customer-name").count() === 0');
  const selectIndex = flowSource.indexOf('page.getByRole("button", { name: nickname, exact: true }).click()');
  const visibleFormIndex = flowSource.indexOf('page.locator("#save-collection-customer-name").waitFor({ state: "visible", timeout: 15_000 })');
  const fillIndex = flowSource.indexOf('getInputByLabel(page, "Customer Name").fill(customerName)');

  assert.ok(navigateIndex >= 0 && pickerIndex > navigateIndex);
  assert.ok(emptyFormIndex > pickerIndex && selectIndex > emptyFormIndex);
  assert.ok(visibleFormIndex > selectIndex && fillIndex > visibleFormIndex);
  assert.match(flowSource, /await nicknamePicker\.waitFor\(\{ state: "visible", timeout: 15_000 \}\)/);
  assert.match(flowSource, /await nicknamePicker\.click\(\)/);
  assert.match(flowSource, /\.includes\(nickname\)/);
  assert.doesNotMatch(flowSource, /applySmokeCollectionNicknameSession|sessionStorage|page\.evaluate\(/);
  assert.match(flowSource, /createPayload\?\.record\?\.collectionStaffNickname === nickname/);
  assert.match(flowSource, /createPayload\?\.record\?\.createdByLogin === username/);
});

test("Collection V9 smoke verifies and revokes POOL without changing user Collection credit", () => {
  const flowStart = smokeSource.indexOf("const checkCollectionManualSettlementV9UiFlow = async");
  const flowEnd = smokeSource.indexOf("const checkCollectionReceiptUiFlow", flowStart);
  const flowSource = smokeSource.slice(flowStart, flowEnd);

  assert.ok(flowStart >= 0 && flowEnd > flowStart);
  assert.match(flowSource, /amount: "150\.00"/);
  assert.match(flowSource, /totalDue: "500\.00"/);
  assert.match(flowSource, /manual-pool-amount/);
  assert.match(flowSource, /\.fill\("350\.00"\)/);
  assert.match(flowSource, /Verify Manual ABORT/);
  assert.match(flowSource, /manualSettlement\?\.poolAmount/);
  assert.match(flowSource, /manualSettlement\?\.effectiveTotal/);
  assert.match(flowSource, /getByText\("VERIFIED", \{ exact: true \}\)/);
  assert.match(flowSource, /locator\("strong"\)\.filter\(\{ hasText: \/\^REVOKED\$\/ \}\)/);
  assert.match(flowSource, /getByText\(cardNumber, \{ exact: true \}\)/);
  assert.match(flowSource, /collection-records-leader-desktop/);
  assert.match(flowSource, /\/api\/search\/collection-history/);
  assert.match(flowSource, /item\?\.kind === "pool"/);
  assert.match(flowSource, /Revoke Manual ABORT/);
  assert.match(flowSource, /manualSettlement\?\.status === "REVOKED"/);
  assert.match(flowSource, /cleanup Manual ABORT V9 Collection record/);
  assert.match(smokeSource, /targetManualSettlement\?\.status === "ACTIVE"/);
  assert.match(smokeSource, /Synthetic smoke cleanup after interrupted verification/);
  assert.match(smokeSource, /"Collection Manual Verified ABORT V9 UI flow"/);
});

test("Billing Principal V3 smoke exercises assigned creation, independent private targets, full calendar and fresh exports", () => {
  const flowStart = smokeSource.indexOf("const checkBillingPrincipalV9UiFlow = async");
  const flowEnd = smokeSource.indexOf("const verifyCollectionSmokeGeneralSearch", flowStart);
  const flowSource = smokeSource.slice(flowStart, flowEnd);
  const phaseIndex = smokeSource.indexOf('"Billing Principal V9 UI flow"');

  assert.ok(flowStart >= 0 && flowEnd > flowStart);
  assert.ok(phaseIndex > flowStart);
  assert.match(flowSource, /createCollectionSmokeSourceImport\(context,/);
  assert.doesNotMatch(flowSource, /applySmokeCollectionNicknameSession|sessionStorage/);
  assert.match(flowSource, /await navigateForSmoke\(page, "\/collection\/billing-principal"\)/);
  assert.match(flowSource, /Create Target/);
  assert.match(flowSource, /osp-assigned-admin/);
  assert.match(flowSource, /osp-configured-source/);
  assert.match(flowSource, /savedTarget\.assignedAdminUserId === admin\.id/);
  assert.match(flowSource, /savedTarget\.activeRevision\.from === from && savedTarget\.activeRevision\.to === to/);
  assert.match(flowSource, /Table A System Billing Principal result/);
  assert.match(flowSource, /Table B Client Billing Principal result/);
  assert.match(flowSource, /D3 private target percentage/);
  assert.match(flowSource, /D3 client result percentage/);
  assert.match(flowSource, /Save Client Result/);
  assert.match(flowSource, /A 30→32 must not overwrite private B 25%/);
  assert.match(flowSource, /System calendar/);
  assert.match(flowSource, /No ALL accounts closed on this date/);
  assert.match(flowSource, /No D6 accounts closed on this date/);
  assert.match(flowSource, /assertSmokeResponseStatus\(created, 200/);
  assert.doesNotMatch(flowSource, /response\.status\(\) === 200/);
  assert.doesNotMatch(flowSource, /\/reconciliations/);
  assert.match(flowSource, /No Table C mutation may be exposed/);
  assert.match(flowSource, /There must be no standalone cumulative account section/);
  assert.match(flowSource, /downloadBillingPrincipalSmokeArtifact\(page, "XLSX"/);
  assert.match(flowSource, /downloadBillingPrincipalSmokeArtifact\(page, "PNG"/);
  assert.match(flowSource, /downloadBillingPrincipalSmokeArtifact\(page, "PDF"/);
  assert.match(flowSource, /visualDatasetRequestCount === 2/);
  assert.match(flowSource, /PNG and PDF must each fetch fresh authorized private data/);
  assert.match(flowSource, /cleanup Billing V3 source/);
  assert.match(flowSource, /cleanup Billing V3 target/);
  assert.match(flowSource, /tracker\.assertClean\("Billing Principal V3 UI flow"\)/);
});

test("General Search smoke proves Collection history is lazy, bounded, and rendered on demand", () => {
  const flowStart = smokeSource.indexOf("const verifyCollectionSmokeGeneralSearch = async");
  const flowEnd = smokeSource.indexOf("const getInputByLabel", flowStart);
  const flowSource = smokeSource.slice(flowStart, flowEnd);

  assert.ok(flowStart >= 0 && flowEnd > flowStart);
  assert.match(flowSource, /page\.on\("request", trackHistoryRequest\)/);
  assert.match(flowSource, /historyRequests\.length === 0/);
  assert.match(flowSource, /\/api\/search\/collection-history/);
  assert.match(flowSource, /url\.searchParams\.get\("pageSize"\) === "10"/);
  assert.match(flowSource, /getByRole\("button", \{ name: "Lihat sejarah" \}\)/);
  assert.match(flowSource, /summary\?\.recordCount >= 1/);
  assert.match(flowSource, /getByTestId\("general-search-collection-history"\)/);
  assert.match(flowSource, /page\.off\("request", trackHistoryRequest\)/);
});

test("backup smoke consumes only recovered GET list rate limits after the destructive flow succeeds", () => {
  const consumeCallIndex = smokeSource.indexOf("consumeExpectedRecoveredBackupListRateLimit(tracker);");
  const backupDeletedIndex = smokeSource.indexOf("backupDeleted = true;", consumeCallIndex - 1_000);
  const assertCleanIndex = smokeSource.indexOf('tracker.assertClean("backup restore UI flow");', consumeCallIndex);

  assert.notEqual(consumeCallIndex, -1);
  assert.ok(backupDeletedIndex >= 0 && backupDeletedIndex < consumeCallIndex);
  assert.ok(assertCleanIndex > consumeCallIndex);
  assert.match(
    smokeSource,
    /const consumeExpectedRecoveredBackupListRateLimit = \(tracker\) => \{[\s\S]*const pattern = "\/api\/backups\?";[\s\S]*entry\.includes\("GET"\)[\s\S]*entry\.includes\(":: 429"\)/,
  );
  assert.doesNotMatch(
    smokeSource,
    /const consumeExpectedRecoveredBackupListRateLimit = \(tracker\) => \{[\s\S]*entry\.includes\("POST"\)/,
  );
});

test("UI smoke has bounded execution, phase diagnostics, and bounded cleanup", () => {
  assert.match(smokeSource, /const SMOKE_TOTAL_TIMEOUT_MS = Number\(process\.env\.SMOKE_TOTAL_TIMEOUT_MS/);
  assert.match(smokeSource, /const SMOKE_PHASE_TIMEOUT_MS = Number\(process\.env\.SMOKE_PHASE_TIMEOUT_MS/);
  assert.match(smokeSource, /const SMOKE_CLEANUP_TIMEOUT_MS = Number\(process\.env\.SMOKE_CLEANUP_TIMEOUT_MS/);
  assert.match(smokeSource, /class SmokeTimeoutError extends Error/);
  assert.match(smokeSource, /const runSmokePhase = async \(label, operation, timeoutMs = smokePhaseTimeoutMs\) =>/);
  assert.match(smokeSource, /`Smoke phase "\$\{label\}"`/);
  assert.match(smokeSource, /BACKUP_JOB_TIMEOUT_MS \+ smokePhaseTimeoutMs/);
  assert.match(smokeSource, /Last active phase: \$\{activeSmokePhase\}/);
  assert.match(smokeSource, /activePhase: activeSmokePhase/);
  assert.match(
    smokeSource,
    /await runSmokePhase\("browser startup", async \(\) => \{[\s\S]*chromium\.launch/,
  );
  assert.match(smokeSource, /if \(smokeTimedOut\) \{[\s\S]*close late smoke browser/);
  assert.match(smokeSource, /smokeTimedOut = error instanceof SmokeTimeoutError/);
  assert.match(smokeSource, /}, smokeTotalTimeoutMs, "UI smoke run"\);/);
  assert.match(smokeSource, /"capture smoke failure artifacts"/);
  assert.match(smokeSource, /"save smoke trace"/);
  assert.match(smokeSource, /"close smoke browser"/);
  assert.match(
    smokeSource,
    /process\.exitCode = error instanceof SmokeTimeoutError \? SMOKE_TIMEOUT_EXIT_CODE : 1/,
  );
});

test("UI smoke failure diagnostics never persist cookie values", () => {
  assert.match(smokeSource, /const cookieNames = \(await context\.cookies\(baseUrl\)\.catch/);
  assert.match(smokeSource, /Live cookie names after logout/);
  assert.doesNotMatch(smokeSource, /const cookies = await context\.cookies\(baseUrl\)/);
  assert.doesNotMatch(smokeSource, /Live cookies after logout/);
});
