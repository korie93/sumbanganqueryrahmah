import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scriptPath = "scripts/verify-server-checkout.sh";
const deploymentGuidePath = "docs/TERMUX_PM2_DEPLOYMENT.md";
const hetznerDeploymentGuidePath = "docs/HETZNER_PRODUCTION_DEPLOYMENT.md";
const promotionPlaybookPath = "docs/PRODUCTION_PROMOTION_PLAYBOOK.md";
const productionRunbookPath = "docs/runbooks/production.md";
const goLiveChecklistPath = "docs/GO_LIVE_LAUNCH_CHECKLIST.md";
const goNoGoTemplatePath = "docs/GO_NO_GO_RELEASE_TEMPLATE.md";
const releaseHardeningSummaryPath = "docs/RELEASE_HARDENING_SUMMARY.md";
const readmePath = "README.md";

function readText(path) {
  return readFileSync(path, "utf8");
}

test("server checkout guard verifies branch, clean tree, and origin parity", () => {
  const script = readText(scriptPath);

  for (const marker of [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'BRANCH="${1:-${SQR_DEPLOY_BRANCH:-main}}"',
    "git fetch origin --prune",
    "Unable to fetch origin before checkout verification",
    "git status --short",
    "git branch --show-current",
    'git rev-parse "origin/$BRANCH"',
    '[[ "$LOCAL_COMMIT" == "$REMOTE_COMMIT" ]]',
    "Working tree has local changes; inspect git status before deploy",
    "Server checkout verification failed",
    "exit 1",
  ]) {
    assert.match(script, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("PM2 deployment guide uses the server checkout guard before install and restart", () => {
  const guide = readText(deploymentGuidePath);

  const guardIndex = guide.indexOf('bash scripts/verify-server-checkout.sh "$BRANCH"');
  const cleanTreeIndex = guide.indexOf('git status --short');
  const switchIndex = guide.indexOf('git switch "$BRANCH"', cleanTreeIndex);
  const mergeIndex = guide.indexOf('git merge --ff-only "origin/$BRANCH"', switchIndex);
  const npmCiIndex = guide.indexOf("npm ci", guardIndex);
  const buildIndex = guide.indexOf("npm run build", guardIndex);
  const restartIndex = guide.indexOf("pm2 restart sqr --update-env", guardIndex);

  assert.ok(cleanTreeIndex > -1, "deployment guide should check for a clean tree before switching branches");
  assert.ok(switchIndex > cleanTreeIndex, "branch switch should run after clean-tree verification");
  assert.ok(mergeIndex > switchIndex, "fast-forward merge should run after switching to the deploy branch");
  assert.ok(guardIndex > -1, "deployment guide should invoke the checkout guard");
  assert.ok(guardIndex > mergeIndex, "checkout guard should run after the fast-forward update");
  assert.ok(npmCiIndex > guardIndex, "npm ci should run after checkout verification");
  assert.ok(buildIndex > guardIndex, "build should run after checkout verification");
  assert.ok(restartIndex > guardIndex, "PM2 restart should run after checkout verification");
  assert.match(guide, /Jangan teruskan `npm ci`, `npm run build`, atau PM2/);
  assert.doesNotMatch(guide, /git pull/);
});

test("README troubleshooting deploy flow uses the checkout guard before install and restart", () => {
  const readme = readText(readmePath);

  const guardIndex = readme.indexOf('bash scripts/verify-server-checkout.sh "$BRANCH"');
  const npmCiIndex = readme.indexOf("npm ci", guardIndex);
  const migrateIndex = readme.indexOf("npm run db:migrate", guardIndex);
  const buildIndex = readme.indexOf("npm run build", guardIndex);
  const restartIndex = readme.indexOf("pm2 restart sqr --update-env", guardIndex);

  assert.ok(guardIndex > -1, "README should invoke the checkout guard in troubleshooting deploy flow");
  assert.ok(npmCiIndex > guardIndex, "README npm ci should run after checkout verification");
  assert.ok(migrateIndex > npmCiIndex, "README migration should run after deterministic install");
  assert.ok(buildIndex > migrateIndex, "README build should run after migration");
  assert.ok(restartIndex > buildIndex, "README PM2 restart should run after build");
  assert.match(readme, /Jangan teruskan `npm ci`, migration, build, atau PM2 restart/);
});

test("Hetzner deployment guide verifies checkout before dependency install", () => {
  const guide = readText(hetznerDeploymentGuidePath);

  const guardIndex = guide.indexOf('bash scripts/verify-server-checkout.sh "$BRANCH"');
  const npmCiIndex = guide.indexOf("npm ci", guardIndex);
  const buildMigrateSectionIndex = guide.indexOf("## 9. Build dan Migrate");
  const migrateIndex = guide.indexOf("npm run db:migrate", buildMigrateSectionIndex);
  const buildIndex = guide.indexOf("npm run build", migrateIndex);
  const pm2SectionIndex = guide.indexOf("## 10. Jalankan App Dengan PM2");
  const pm2StartIndex = guide.indexOf("pm2 start ecosystem.config.cjs", pm2SectionIndex);

  assert.ok(guardIndex > -1, "Hetzner guide should invoke the checkout guard");
  assert.ok(npmCiIndex > guardIndex, "npm ci should run after checkout verification");
  assert.ok(buildMigrateSectionIndex > guardIndex, "build/migrate section should follow checkout verification");
  assert.ok(migrateIndex > guardIndex, "migration should run after checkout verification");
  assert.ok(buildIndex > migrateIndex, "build should run after migration");
  assert.ok(pm2StartIndex > guardIndex, "PM2 start should run after checkout verification");

  for (const marker of [
    "BRANCH=main",
    "working tree yang tidak bersih",
    "masalah fetch `origin`",
    "belum sama dengan `origin/$BRANCH`",
    "Jangan migrate atau build jika guard itu gagal",
  ]) {
    assert.match(guide, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("production promotion playbook requires the server checkout gate before deploy", () => {
  const playbook = readText(promotionPlaybookPath);

  for (const marker of [
    "Server Checkout Gate",
    'BRANCH=main',
    'bash scripts/verify-server-checkout.sh "$BRANCH"',
    "wrong branch",
    "local changes",
    "cannot fetch `origin`",
    "behind `origin/$BRANCH`",
    "server checkout gate passes for the promoted branch",
  ]) {
    assert.match(playbook, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("production runbook documents the standard main update sequence", () => {
  const runbook = readText(productionRunbookPath);

  const standardUpdateIndex = runbook.indexOf("## Standard Main Update");
  const fetchIndex = runbook.indexOf("git fetch origin --prune", standardUpdateIndex);
  const switchIndex = runbook.indexOf("git switch main", fetchIndex);
  const resetIndex = runbook.indexOf("git reset --hard origin/main", switchIndex);
  const logIndex = runbook.indexOf("git log -1 --oneline", resetIndex);
  const guardIndex = runbook.indexOf('bash scripts/verify-server-checkout.sh "$BRANCH"', logIndex);
  const npmCiIndex = runbook.indexOf("npm ci", guardIndex);
  const migrateIndex = runbook.indexOf("npm run db:migrate", npmCiIndex);
  const buildIndex = runbook.indexOf("npm run build", migrateIndex);
  const restartIndex = runbook.indexOf("pm2 restart sqr --update-env", buildIndex);
  const readyIndex = runbook.indexOf("curl -fsS http://127.0.0.1:5000/api/health/ready", restartIndex);

  assert.ok(standardUpdateIndex > -1, "production runbook should document the standard main update path");
  assert.ok(fetchIndex > standardUpdateIndex, "standard update should fetch origin first");
  assert.ok(switchIndex > fetchIndex, "standard update should switch to main after fetching");
  assert.ok(resetIndex > switchIndex, "standard update should sync exactly to origin/main");
  assert.ok(logIndex > resetIndex, "standard update should show the deployed commit");
  assert.ok(guardIndex > logIndex, "checkout guard should run after origin/main sync");
  assert.ok(npmCiIndex > guardIndex, "npm ci should run after checkout verification");
  assert.ok(migrateIndex > npmCiIndex, "migrations should run after deterministic install");
  assert.ok(buildIndex > migrateIndex, "build should run after migrations");
  assert.ok(restartIndex > buildIndex, "PM2 restart should run after build");
  assert.ok(readyIndex > restartIndex, "ready check should run after restart");

  assert.match(runbook, /Stop the deployment if the checkout gate fails/);
  assert.match(runbook, /Do not continue by editing\s+tracked files/);
  assert.match(runbook, /previous-known-good-commit/);
});

test("go-live docs include the server checkout gate in final release checks", () => {
  const checklist = readText(goLiveChecklistPath);
  const template = readText(goNoGoTemplatePath);

  for (const content of [checklist, template]) {
    assert.match(content, /bash scripts\/verify-server-checkout\.sh "\$BRANCH"/);
    assert.match(content, /deployment server/i);
  }

  assert.match(checklist, /before `npm ci`, build, or PM2 restart/);
  assert.match(template, /Pre-Deploy Gate/);
});

test("release hardening summary keeps staging deploy deterministic and guarded", () => {
  const summary = readText(releaseHardeningSummaryPath);

  const stagingIndex = summary.indexOf("### Staging deploy host");
  const guardIndex = summary.indexOf('bash scripts/verify-server-checkout.sh "$BRANCH"', stagingIndex);
  const npmCiIndex = summary.indexOf("npm ci", guardIndex);
  const migrateIndex = summary.indexOf("npm run db:migrate", guardIndex);
  const buildIndex = summary.indexOf("npm run build", guardIndex);

  assert.ok(stagingIndex > -1, "release summary should include staging deploy host commands");
  assert.ok(guardIndex > stagingIndex, "checkout guard should be in the staging deploy sequence");
  assert.ok(npmCiIndex > guardIndex, "npm ci should run after checkout verification");
  assert.ok(migrateIndex > npmCiIndex, "migration should run after deterministic install");
  assert.ok(buildIndex > migrateIndex, "build should run after migration");
  assert.doesNotMatch(summary, /npm install/);
});
