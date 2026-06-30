import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readReleaseReadinessScript() {
  return readFileSync(path.join(repoRoot, "scripts", "release-readiness-local.mjs"), "utf8");
}

test("release readiness verifies runtime and supply-chain gates before database work", () => {
  const script = readReleaseReadinessScript();
  const nodeVersionIndex = script.indexOf('["run", "verify:node-version"]');
  const repoHygieneIndex = script.indexOf('["run", "verify:repo-hygiene"]');
  const dependencyAuditIndex = script.indexOf('["run", "audit:dependencies"]');
  const xlsxIntegrityIndex = script.indexOf('["run", "verify:xlsx-vendor-integrity"]');
  const postgresIndex = script.indexOf("checking PostgreSQL connectivity");

  assert.notEqual(nodeVersionIndex, -1);
  assert.notEqual(repoHygieneIndex, -1);
  assert.notEqual(dependencyAuditIndex, -1);
  assert.notEqual(xlsxIntegrityIndex, -1);
  assert.notEqual(postgresIndex, -1);
  assert.ok(nodeVersionIndex < repoHygieneIndex);
  assert.ok(repoHygieneIndex < dependencyAuditIndex);
  assert.ok(dependencyAuditIndex < xlsxIntegrityIndex);
  assert.ok(xlsxIntegrityIndex < postgresIndex);
});

test("release readiness keeps typecheck and lint in the fail-fast gate", () => {
  const script = readReleaseReadinessScript();
  const xlsxIntegrityIndex = script.indexOf('["run", "verify:xlsx-vendor-integrity"]');
  const typecheckIndex = script.indexOf('["run", "typecheck"]');
  const lintIndex = script.indexOf('["run", "lint"]');
  const postgresIndex = script.indexOf("checking PostgreSQL connectivity");

  assert.notEqual(xlsxIntegrityIndex, -1);
  assert.notEqual(typecheckIndex, -1);
  assert.notEqual(lintIndex, -1);
  assert.notEqual(postgresIndex, -1);
  assert.ok(xlsxIntegrityIndex < typecheckIndex);
  assert.ok(typecheckIndex < lintIndex);
  assert.ok(lintIndex < postgresIndex);
});
