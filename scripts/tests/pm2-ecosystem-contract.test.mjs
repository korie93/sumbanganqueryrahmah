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
  assert.equal(app.kill_timeout, 10_000);
  assert.equal(app.listen_timeout, 5_000);
  assert.equal(app.env?.GRACEFUL_SHUTDOWN_TIMEOUT_MS, "10000");
});

test("PM2 deployment docs mention build-before-restart readiness contract", async () => {
  const termuxDocs = await readFile("docs/TERMUX_PM2_DEPLOYMENT.md", "utf8");
  const hetznerDocs = await readFile("docs/HETZNER_PRODUCTION_DEPLOYMENT.md", "utf8");

  for (const content of [termuxDocs, hetznerDocs]) {
    assert.match(content, /wait_ready/);
    assert.match(content, /shutdown_with_message/);
    assert.match(content, /npm run build/);
    assert.match(content, /dist-local\/server\/cluster-local\.js/);
  }
});
