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

test("release readiness verifies database rollback governance before test suites", () => {
  const script = readReleaseReadinessScript();
  const schemaGovernanceIndex = script.indexOf('["run", "verify:db-schema-governance"]');
  const rollbackGovernanceIndex = script.indexOf('["run", "verify:db-migration-rollback"]');
  const apiContractTestIndex = script.indexOf('["run", "test:contracts"]');
  const clientTestIndex = script.indexOf('["run", "test:client"]');

  assert.notEqual(schemaGovernanceIndex, -1);
  assert.notEqual(rollbackGovernanceIndex, -1);
  assert.notEqual(apiContractTestIndex, -1);
  assert.notEqual(clientTestIndex, -1);
  assert.ok(schemaGovernanceIndex < rollbackGovernanceIndex);
  assert.ok(rollbackGovernanceIndex < apiContractTestIndex);
  assert.ok(apiContractTestIndex < clientTestIndex);
});

test("release readiness runs API contract tests before the release build", () => {
  const script = readReleaseReadinessScript();
  const apiContractTestIndex = script.indexOf('["run", "test:contracts"]');
  const buildIndex = script.indexOf('["run", "build"]');

  assert.notEqual(apiContractTestIndex, -1);
  assert.notEqual(buildIndex, -1);
  assert.ok(apiContractTestIndex < buildIndex);
});

test("release readiness runs every backend regression suite before building", () => {
  const script = readReleaseReadinessScript();
  const suiteNames = [
    "test:auth",
    "test:http",
    "test:services",
    "test:repositories",
    "test:routes",
    "test:ws",
    "test:intelligence",
  ];
  const buildIndex = script.indexOf('["run", "build"]');

  assert.notEqual(buildIndex, -1);
  for (const suiteName of suiteNames) {
    const suiteIndex = script.indexOf(`["run", "${suiteName}"]`);

    assert.notEqual(suiteIndex, -1, `${suiteName} must run during release readiness`);
    assert.ok(suiteIndex < buildIndex, `${suiteName} must run before the release build`);
  }
});

test("release readiness runs regression suites with isolated PII rollout env", () => {
  const script = readReleaseReadinessScript();
  const suiteNames = [
    "test:contracts",
    "test:client",
    "test:scripts",
    "test:db-integration",
    "test:auth",
    "test:http",
    "test:services",
    "test:repositories",
    "test:routes",
    "test:ws",
    "test:intelligence",
  ];

  assert.match(script, /const regressionTestEnv = buildRegressionTestEnv\(env\)/);
  assert.match(script, /COLLECTION_PII_RETIRED_FIELDS: _collectionPiiRetiredFields/);
  assert.match(script, /COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS: _collectionPiiEncryptionKeyPrevious/);
  assert.match(script, /VERIFY_COLLECTION_PII_FULL_RETIREMENT: _verifyCollectionPiiFullRetirement/);
  assert.match(script, /VERIFY_COLLECTION_PII_SENSITIVE_RETIREMENT: _verifyCollectionPiiSensitiveRetirement/);
  for (const suiteName of suiteNames) {
    assert.match(
      script,
      new RegExp(`await runNpm\\(\\["run", "${suiteName}"\\], \\{ env: regressionTestEnv \\}\\);`),
      `${suiteName} must use the isolated regression test env`,
    );
  }
});
