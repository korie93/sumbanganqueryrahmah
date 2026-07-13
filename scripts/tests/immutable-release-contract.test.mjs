import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readText(filePath) {
  return readFileSync(filePath, "utf8");
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

  assert.match(deployScript, /set -euo pipefail/);
  assert.match(deployScript, /flock -n 9/);
  assert.match(deployScript, /SQR_EXPECTED_RELEASE_SHA/);
  assert.match(deployScript, /\/api\/health\/version/);
  assert.match(deployScript, /restore_previous_release/);
  assert.match(deployScript, /release archive contains an unsupported entry type/);
  assert.match(deployScript, /production env file cannot be stored inside an immutable release/);
  assert.match(deployScript, /OLD_PREVIOUS_RELEASE/);
  assert.match(deployScript, /mv -Tf "\$APP_ROOT\/previous\.rollback" "\$PREVIOUS_LINK"/);
  assert.ok(checksumIndex > -1 && checksumIndex < installIndex);
  assert.ok(installIndex < migrationIndex);
  assert.ok(migrationIndex < promotionIndex);
});

test("rollback accepts only managed release links and verifies embedded SHA", () => {
  const rollbackScript = readText("deploy/immutable/rollback-release.sh");

  assert.match(rollbackScript, /set -euo pipefail/);
  assert.match(rollbackScript, /flock -n 9/);
  assert.match(rollbackScript, /points outside the managed release directory/);
  assert.match(rollbackScript, /\/api\/health\/version/);
  assert.match(rollbackScript, /original release restored/);
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
