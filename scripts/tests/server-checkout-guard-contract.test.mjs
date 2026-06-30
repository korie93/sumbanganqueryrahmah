import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scriptPath = "scripts/verify-server-checkout.sh";
const deploymentGuidePath = "docs/TERMUX_PM2_DEPLOYMENT.md";
const promotionPlaybookPath = "docs/PRODUCTION_PROMOTION_PLAYBOOK.md";

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
