import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadPm2ExampleConfig() {
  const source = await readFile("deploy/pm2/ecosystem.config.cjs.example", "utf8");
  const sandbox = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(source, sandbox, {
    filename: "deploy/pm2/ecosystem.config.cjs.example",
  });
  return sandbox.module.exports;
}

test("PM2 ecosystem example uses direct Node entrypoint with readiness and graceful shutdown", async () => {
  const config = await loadPm2ExampleConfig();
  const app = config?.apps?.[0];

  assert.ok(app, "expected one PM2 app definition");
  assert.equal(app.script, "dist-local/server/cluster-local.js");
  assert.equal(app.interpreter, "node");
  assert.equal(app.args, undefined);
  assert.equal(app.wait_ready, true);
  assert.equal(app.shutdown_with_message, true);
  assert.equal(
    app.kill_timeout,
    Number(app.env?.GRACEFUL_SHUTDOWN_TIMEOUT_MS) + 5_000,
    "AUDIT-FIX [M14]: PM2 kill_timeout must keep a 5s buffer after graceful shutdown",
  );
  assert.equal(app.listen_timeout, 5_000);
  assert.equal(app.env?.GRACEFUL_SHUTDOWN_TIMEOUT_MS, "10000");
  assert.equal(app.max_memory_restart, "768M");
  assert.equal(app.node_args, "--max-old-space-size=600");
});

test("PM2 deployment docs mention build-before-restart readiness contract", async () => {
  const termuxDocs = await readFile("docs/TERMUX_PM2_DEPLOYMENT.md", "utf8");
  const hetznerDocs = await readFile("docs/HETZNER_PRODUCTION_DEPLOYMENT.md", "utf8");

  for (const content of [termuxDocs, hetznerDocs]) {
    assert.match(content, /wait_ready/);
    assert.match(content, /shutdown_with_message/);
    assert.match(content, /npm run build/);
    assert.match(content, /dist-local\/server\/cluster-local\.js/);
    assert.match(content, /GRACEFUL_SHUTDOWN_TIMEOUT_MS:\s*"10000"/);
    assert.match(content, /kill_timeout:\s*15000/);
    assert.doesNotMatch(content, /kill_timeout:\s*10000/);
  }

  assert.match(hetznerDocs, /pm2 start ecosystem\.config\.cjs/);
  assert.doesNotMatch(hetznerDocs, /pm2 start npm --name sqr -- start/);
});

test("PM2 deployment docs require branch and commit verification before restart", async () => {
  const termuxDocs = await readFile("docs/TERMUX_PM2_DEPLOYMENT.md", "utf8");

  for (const marker of [
    "git fetch origin --prune",
    'bash scripts/verify-server-checkout.sh "$BRANCH"',
    "git log -1 --oneline",
    "npm ci",
    "npm run build",
    "pm2 restart sqr --update-env",
    "curl -fsS http://127.0.0.1:5000/api/health/ready",
  ]) {
    assert.match(termuxDocs, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("PM2 memory sizing guide documents limits, monitoring, and worker guardrails", async () => {
  const guide = await readFile("docs/DEPLOYMENT-SIZING-GUIDE.md", "utf8");
  const ecosystem = await readFile("deploy/pm2/ecosystem.config.cjs.example", "utf8");
  const termuxDocs = await readFile("docs/TERMUX_PM2_DEPLOYMENT.md", "utf8");
  const hetznerDocs = await readFile("docs/HETZNER_PRODUCTION_DEPLOYMENT.md", "utf8");

  assert.match(guide, /max_memory_restart = base_memory x 1\.5 x safety_factor/);
  assert.match(guide, /\| Low \| kurang 100 req\/min \| `512M` \| `--max-old-space-size=400` \| `1` \|/);
  assert.match(guide, /\| Medium \| 100-500 req\/min \| `768M` \| `--max-old-space-size=600` \| `1-2` \|/);
  assert.match(guide, /\| High \| 500-1500 req\/min \| `1024M` \| `--max-old-space-size=800` \| `2-4` \|/);
  assert.match(guide, /pm2 monit/);
  assert.match(guide, /pm2 list/);
  assert.match(guide, /SQR_MAX_WORKERS=1/);
  assert.match(guide, /SQR_RATE_LIMIT_STORE=redis/);
  assert.match(guide, /SQR_WS_SHARED_BUS=redis/);

  assert.match(ecosystem, /DEPLOYMENT-SIZING-GUIDE\.md/);
  assert.match(termuxDocs, /DEPLOYMENT-SIZING-GUIDE\.md/);
  assert.match(hetznerDocs, /DEPLOYMENT-SIZING-GUIDE\.md/);
});
