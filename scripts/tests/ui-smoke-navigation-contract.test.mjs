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
