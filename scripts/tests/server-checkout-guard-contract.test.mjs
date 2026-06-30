import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scriptPath = "scripts/verify-server-checkout.sh";
const deploymentGuidePath = "docs/TERMUX_PM2_DEPLOYMENT.md";
const hetznerDeploymentGuidePath = "docs/HETZNER_PRODUCTION_DEPLOYMENT.md";
const promotionPlaybookPath = "docs/PRODUCTION_PROMOTION_PLAYBOOK.md";
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
  const npmCiIndex = guide.indexOf("npm ci", guardIndex);
  const buildIndex = guide.indexOf("npm run build", guardIndex);
  const restartIndex = guide.indexOf("pm2 restart sqr --update-env", guardIndex);

  assert.ok(guardIndex > -1, "deployment guide should invoke the checkout guard");
  assert.ok(npmCiIndex > guardIndex, "npm ci should run after checkout verification");
  assert.ok(buildIndex > guardIndex, "build should run after checkout verification");
  assert.ok(restartIndex > guardIndex, "PM2 restart should run after checkout verification");
  assert.match(guide, /Jangan teruskan `npm ci`, `npm run build`, atau PM2/);
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

  assert.ok(guardIndex > -1, "Hetzner guide should invoke the checkout guard");
  assert.ok(npmCiIndex > guardIndex, "npm ci should run after checkout verification");

  for (const marker of [
    "BRANCH=main",
    "working tree yang tidak bersih",
    "masalah fetch `origin`",
    "belum sama dengan `origin/$BRANCH`",
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
