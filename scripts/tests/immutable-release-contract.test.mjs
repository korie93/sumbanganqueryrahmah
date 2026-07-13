import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function loadReleasePm2Config(env = {}) {
  const filePath = "deploy/pm2/ecosystem.release.config.cjs";
  const source = readText(filePath);
  const sandbox = {
    module: { exports: {} },
    exports: {},
    process: { env },
    require(specifier) {
      assert.equal(specifier, "node:path");
      return path;
    },
  };
  vm.runInNewContext(source, sandbox, { filename: filePath });
  return sandbox.module.exports;
}

test("release workflow gates approved artifacts behind the production environment", () => {
  const workflow = readText(".github/workflows/release-verification.yml");

  for (const marker of [
    "Prepare immutable release candidate",
    "Production release artifacts may only be created from main.",
    "npm run release:package",
    "sha512sum",
    "approve-production-release:",
    "name: production",
    "production-release-${{ github.sha }}",
  ]) {
    assert.match(workflow, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(workflow, /actions\/download-artifact@[0-9a-f]{40}/);
  assert.doesNotMatch(workflow, /SQR_RELEASE_ENV_FILE/);
});

test("immutable deploy verifies integrity before install and rolls back failed promotion", () => {
  const deployScript = readText("deploy/immutable/deploy-release.sh");
  const checksumIndex = deployScript.indexOf("release file inventory verification failed");
  const installIndex = deployScript.indexOf("npm ci --omit=dev");
  const migrationIndex = deployScript.indexOf("npm run db:migrate");
  const promotionIndex = deployScript.indexOf("mv -Tf \"$APP_ROOT/current.next\"");
  const registrationIndex = deployScript.indexOf("pm2 jlist");
  const legacySnapshotIndex = deployScript.indexOf("pm2 save", registrationIndex);
  const legacyDeleteIndex = deployScript.indexOf('pm2 delete "$PM2_APP_NAME"', registrationIndex);
  const finalPersistIndex = deployScript.lastIndexOf("pm2 save");
  const successIndex = deployScript.indexOf("Release deployed successfully");

  assert.match(deployScript, /set -euo pipefail/);
  assert.match(deployScript, /flock -n 9/);
  assert.match(deployScript, /SQR_EXPECTED_RELEASE_SHA/);
  assert.match(deployScript, /\/api\/health\/version/);
  assert.match(deployScript, /restore_previous_release/);
  assert.match(deployScript, /release archive contains an unsupported entry type/);
  assert.match(deployScript, /production env file cannot be stored inside an immutable release/);
  assert.match(deployScript, /OLD_PREVIOUS_RELEASE/);
  assert.match(deployScript, /mv -Tf "\$APP_ROOT\/previous\.rollback" "\$PREVIOUS_LINK"/);
  assert.match(deployScript, /PM2_CONFIG="\$RELEASE_DIR\/deploy\/pm2\/ecosystem\.release\.config\.cjs"/);
  assert.match(deployScript, /LEGACY_PM2_REPLACED/);
  assert.match(deployScript, /pm2 resurrect/);
  assert.ok(checksumIndex > -1 && checksumIndex < installIndex);
  assert.ok(installIndex < migrationIndex);
  assert.ok(migrationIndex < promotionIndex);
  assert.ok(registrationIndex > promotionIndex);
  assert.ok(legacySnapshotIndex > registrationIndex && legacySnapshotIndex < legacyDeleteIndex);
  assert.ok(finalPersistIndex > legacyDeleteIndex && finalPersistIndex < successIndex);
});

test("immutable PM2 config filters deployment-only shell state from the application", () => {
  const config = loadReleasePm2Config({
    NODE_EXTRA_CA_CERTS: "/runtime/redis-ca.crt",
    SQR_PM2_APP_NAME: "sqr-test",
    SQR_RELEASE_ROOT: "/srv/sqr-runtime",
  });
  const app = config?.apps?.[0];

  assert.ok(app, "expected one immutable PM2 app definition");
  assert.equal(app.name, "sqr-test");
  assert.equal(app.cwd, path.join("/srv/sqr-runtime", "current"));
  assert.equal(app.env?.NODE_EXTRA_CA_CERTS, "/runtime/redis-ca.crt");
  assert.deepEqual(Array.from(app.filter_env), [
    "SQR_EXPECTED_RELEASE_SHA",
    "SQR_PM2_APP_NAME",
    "SQR_POST_DEPLOY_",
    "SQR_PUBLIC_BASE_URL",
    "SQR_RELEASE_",
  ]);
});

test("rollback accepts only managed release links and verifies embedded SHA", () => {
  const rollbackScript = readText("deploy/immutable/rollback-release.sh");

  assert.match(rollbackScript, /set -euo pipefail/);
  assert.match(rollbackScript, /flock -n 9/);
  assert.match(rollbackScript, /points outside the managed release directory/);
  assert.match(rollbackScript, /\/api\/health\/version/);
  assert.match(rollbackScript, /original release restored/);
  assert.match(rollbackScript, /PM2_CONFIG="\$CURRENT_RELEASE\/deploy\/pm2\/ecosystem\.release\.config\.cjs"/);
  assert.match(rollbackScript, /pm2 save/);
});

test("immutable release documentation keeps secrets external and migrations forward-only", () => {
  const documentation = readText("docs/IMMUTABLE_RELEASES.md");
  const productionRunbook = readText("docs/runbooks/production.md");

  assert.match(documentation, /Production secrets, uploads, generated runtime data/i);
  assert.match(documentation, /never copied into the release artifact/i);
  assert.match(documentation, /Database migrations are forward-only/);
  assert.match(documentation, /required reviewer/);
  assert.match(documentation, /SQR_RELEASE_ENV_FILE/);
  assert.match(documentation, /SQR_EXPECTED_RELEASE_SHA/);
  assert.match(productionRunbook, /preferred deployment path.*immutable artifact/i);
});
