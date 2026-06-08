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
