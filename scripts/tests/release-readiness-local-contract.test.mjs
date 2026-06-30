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
  const sbomIndex = script.indexOf('["run", "supply-chain:sbom"]');
  const postgresIndex = script.indexOf("checking PostgreSQL connectivity");

  assert.notEqual(nodeVersionIndex, -1);
  assert.notEqual(repoHygieneIndex, -1);
  assert.notEqual(dependencyAuditIndex, -1);
  assert.notEqual(xlsxIntegrityIndex, -1);
  assert.notEqual(sbomIndex, -1);
  assert.notEqual(postgresIndex, -1);
  assert.ok(nodeVersionIndex < repoHygieneIndex);
  assert.ok(repoHygieneIndex < dependencyAuditIndex);
  assert.ok(dependencyAuditIndex < xlsxIntegrityIndex);
  assert.ok(xlsxIntegrityIndex < sbomIndex);
  assert.ok(sbomIndex < postgresIndex);
});

test("release readiness keeps typecheck and lint in the fail-fast gate", () => {
  const script = readReleaseReadinessScript();
  const sbomIndex = script.indexOf('["run", "supply-chain:sbom"]');
  const typecheckIndex = script.indexOf('["run", "typecheck"]');
  const lintIndex = script.indexOf('["run", "lint"]');
  const postgresIndex = script.indexOf("checking PostgreSQL connectivity");

  assert.notEqual(sbomIndex, -1);
  assert.notEqual(typecheckIndex, -1);
  assert.notEqual(lintIndex, -1);
  assert.notEqual(postgresIndex, -1);
  assert.ok(sbomIndex < typecheckIndex);
  assert.ok(typecheckIndex < lintIndex);
  assert.ok(lintIndex < postgresIndex);
});

test("release readiness writes SBOM artifacts under the local release artifact directory by default", () => {
  const script = readReleaseReadinessScript();

  assert.match(script, /const sbomArtifactsDir = path\.join\(artifactsDir, "sbom"\)/);
  assert.match(script, /SBOM_ARTIFACTS_DIR: process\.env\.SBOM_ARTIFACTS_DIR \|\| sbomArtifactsDir/);
});
