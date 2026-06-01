import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const servicePath = path.join(repoRoot, "deploy", "systemd", "sqr.service.example");
const deploymentGuidePath = path.join(repoRoot, "docs", "HETZNER_PRODUCTION_DEPLOYMENT.md");

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

test("systemd service example documents strict EnvironmentFile permissions", () => {
  const serviceText = readText(servicePath);

  assert.match(serviceText, /SECURITY NOTE: EnvironmentFile permissions/);
  assert.match(serviceText, /EnvironmentFile=\/etc\/sqr\/production\.env/);
  assert.match(serviceText, /sudo install -d -o root -g deploy -m 0750 \/etc\/sqr/);
  assert.match(serviceText, /sudo install -o root -g deploy -m 0640/);
  assert.match(serviceText, /-rw-r----- 1 root deploy/);
  assert.match(serviceText, /root:sqr/);
  assert.match(serviceText, /Do not use\s+# 0644, 0755, or a user-owned environment file/i);
});

test("Hetzner deployment guide includes the systemd EnvironmentFile checklist", () => {
  const docText = readText(deploymentGuidePath);

  assert.match(docText, /sudo install -d -o root -g deploy -m 0750 \/etc\/sqr/);
  assert.match(docText, /sudo install -o root -g deploy -m 0640/);
  assert.match(docText, /EnvironmentFile=\/etc\/sqr\/production\.env/);
  assert.match(docText, /Expected: `?-rw-r----- 1 root deploy/);
  assert.match(docText, /Jika anda tukar service user\/group kepada `sqr`, gunakan\s+`root:sqr`/);
});
