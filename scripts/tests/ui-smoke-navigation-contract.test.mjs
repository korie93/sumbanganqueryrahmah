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

test("collection receipt smoke verifies Saved coverage before submitting the required source", () => {
  const sourceMatchIndex = smokeSource.indexOf(
    'page.getByRole("button", { name: "Semak Matching" }).click()',
  );
  const createWaitIndex = smokeSource.indexOf("const createResponsePromise", sourceMatchIndex);
  const saveIndex = smokeSource.indexOf(
    'page.getByRole("button", { name: "Save Collection" }).click()',
    createWaitIndex,
  );

  assert.match(smokeSource, /"TOTAL DUE": "12\.34"/);
  assert.match(smokeSource, /"Billing Principal \(OSP\)": "10\.00"/);
  assert.match(
    smokeSource,
    /new URL\(response\.url\(\)\)\.pathname === "\/api\/collection\/source-matches"/,
  );
  assert.match(
    smokeSource,
    /document\.querySelector\("#save-collection-source-match"\)\?\.value === expectedSourceImportId/,
  );
  assert.match(
    smokeSource,
    /page\.getByLabel\("Aging", \{ exact: true \}\)\.selectOption\("D6"\)/,
  );
  assert.match(smokeSource, /page\.getByText\("Abort CP", \{ exact: true \}\)/);
  assert.ok(sourceMatchIndex >= 0 && sourceMatchIndex < createWaitIndex);
  assert.ok(createWaitIndex < saveIndex);
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
  assert.match(smokeSource, /const SMOKE_CLEANUP_TIMEOUT_MS = Number\(process\.env\.SMOKE_CLEANUP_TIMEOUT_MS/);
  assert.match(smokeSource, /class SmokeTimeoutError extends Error/);
  assert.match(smokeSource, /const runSmokePhase = async \(label, operation\) =>/);
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
