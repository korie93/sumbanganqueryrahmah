import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scriptPath = "scripts/post-deploy-health-check.sh";
const playbookPath = "docs/PRODUCTION_PROMOTION_PLAYBOOK.md";
const securityHeadersPath = "deploy/SECURITY_HEADERS.md";

function readText(path) {
  return readFileSync(path, "utf8");
}

test("post-deploy health script verifies live readiness and app-owned security headers", () => {
  const script = readText(scriptPath);

  assert.match(script, /^#!\/usr\/bin\/env bash/);
  assert.match(script, /set -euo pipefail/);
  assert.match(script, /SQR_POST_DEPLOY_BASE_URL/);
  assert.match(script, /\/api\/health\/live/);
  assert.match(script, /\/api\/health\/ready/);
  assert.match(script, /Content-Security-Policy/);
  assert.match(script, /require-trusted-types-for/);
  assert.match(script, /X-Content-Type-Options/);
  assert.match(script, /X-Frame-Options" "SAMEORIGIN"/);
  assert.match(script, /Referrer-Policy" "no-referrer"/);
  assert.match(script, /Permissions-Policy" "camera=\(\)"/);
  assert.match(script, /Cross-Origin-Opener-Policy/);
  assert.match(script, /Cross-Origin-Resource-Policy/);
  assert.match(script, /Strict-Transport-Security header is missing on HTTPS deployment/);
  assert.match(script, /CSP script-src does not allow unsafe-inline/);
  assert.match(script, /\/api\/auth\/login/);
  assert.match(script, /SQR_POST_DEPLOY_RATE_LIMIT_PROBE/);
  assert.match(script, /exit 1/);
});

test("promotion docs wire the post-deploy health gate into release operations", () => {
  const playbook = readText(playbookPath);
  const securityHeaders = readText(securityHeadersPath);

  for (const marker of [
    "Post-Deployment Health Gate",
    "bash scripts/post-deploy-health-check.sh https://sqr-system.com",
    "SQR_POST_DEPLOY_RATE_LIMIT_PROBE=1",
    "Do not mark a deploy complete while this script exits non-zero",
  ]) {
    assert.match(playbook, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(securityHeaders, /bash scripts\/post-deploy-health-check\.sh https:\/\/sqr-system\.com/);
});
