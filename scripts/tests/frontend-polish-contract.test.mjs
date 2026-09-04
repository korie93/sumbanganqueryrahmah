import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function listSourceFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(entryPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

test("frontend does not use non-native elements with role button", () => {
  const clientSourceRoot = path.join(repoRoot, "client", "src");
  const offenders = [];
  const nonNativeRoleButtonPattern = /<(?!button\b)[A-Za-z][^>]*\srole=(?:"button"|'button')/g;

  for (const filePath of listSourceFiles(clientSourceRoot)) {
    const source = readFileSync(filePath, "utf8");
    if (nonNativeRoleButtonPattern.test(source)) {
      offenders.push(path.relative(repoRoot, filePath));
    }
  }

  assert.deepEqual(offenders, []);
});

test("accessibility contrast wrapper delegates to the axe-backed contract", () => {
  const scriptPath = path.join(repoRoot, "scripts", "a11y-contrast-check.sh");
  const script = readFileSync(scriptPath, "utf8");

  assert.match(script, /set -euo pipefail/);
  assert.match(script, /A11Y_BASE_URL=/);
  assert.match(script, /npm run test:e2e:a11y/);
});

test("release readiness isolates UI smoke from previous local rate-limit windows", () => {
  const script = readFileSync(path.join(repoRoot, "scripts", "release-readiness-local.mjs"), "utf8");
  const a11yIndex = script.indexOf('["run", "test:e2e:a11y"]');
  const cooldownMessageIndex = script.indexOf(
    'console.log("Release readiness: waiting for local adaptive-rate window to reset before UI smoke...")',
  );
  const cooldownIndex = script.indexOf(
    "await wait(ADAPTIVE_RATE_WINDOW_COOLDOWN_MS)",
    cooldownMessageIndex,
  );
  const smokeIndex = script.indexOf("await runUiSmokeWithTimeoutRetry(env)");

  assert.notEqual(a11yIndex, -1);
  assert.notEqual(cooldownMessageIndex, -1);
  assert.notEqual(cooldownIndex, -1);
  assert.notEqual(smokeIndex, -1);
  assert.ok(a11yIndex < cooldownMessageIndex);
  assert.ok(cooldownMessageIndex < cooldownIndex);
  assert.ok(cooldownIndex < smokeIndex);
});

test("release readiness fails fast on typecheck and lint before database work", () => {
  const script = readFileSync(path.join(repoRoot, "scripts", "release-readiness-local.mjs"), "utf8");
  const dependencyAuditIndex = script.indexOf('["run", "audit:dependencies"]');
  const typecheckIndex = script.indexOf('["run", "typecheck"]');
  const lintIndex = script.indexOf('["run", "lint"]');
  const postgresIndex = script.indexOf("checking PostgreSQL connectivity");

  assert.notEqual(dependencyAuditIndex, -1);
  assert.notEqual(typecheckIndex, -1);
  assert.notEqual(lintIndex, -1);
  assert.notEqual(postgresIndex, -1);
  assert.ok(dependencyAuditIndex < typecheckIndex);
  assert.ok(typecheckIndex < lintIndex);
  assert.ok(lintIndex < postgresIndex);
});

test("performance notes document useLatestRef audit findings", () => {
  const notes = readFileSync(path.join(repoRoot, "docs", "PERFORMANCE-NOTES.md"), "utf8");

  for (const marker of [
    "P4-3 useLatestRef Audit",
    "7 necessary instances",
    "0 optional removals",
    "client/src/components/AutoLogout.tsx",
    "client/src/hooks/useSystemMetrics.ts",
    "visibility changes",
    "forced logout",
  ]) {
    assert.match(notes, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
