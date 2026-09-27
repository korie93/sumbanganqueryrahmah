import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildVisualBuiltEnvironment, parseVisualBuiltArgs, startVisualBuiltServer } from "../test-visual-built.mjs";

test("built visual runner accepts only bounded explicit snapshot, grep and single-worker options", () => {
  assert.deepEqual(parseVisualBuiltArgs([]), []);
  const args = ["--update-snapshots", "--grep", "dashboard|settings", "--workers=1"];
  assert.deepEqual(parseVisualBuiltArgs(args), args);
  for (const args of [["--config=other.ts"], ["--grep"], ["--grep", ""], ["--grep", "["],
    ["--grep", "x".repeat(201)], ["--grep", "--help"], ["--grep", "foo\nbar"],
    ["--workers=2"], ["--headed"], ["--update-snapshots", "--update-snapshots"], ["--grep", "a", "--grep", "b"]]) {
    assert.throws(() => parseVisualBuiltArgs(args));
  }
});

test("built visual child receives only OS support and fresh loopback configuration, never application secrets", () => {
  const disabled = path.resolve("dist-local/public/no-visual-dotenv.env");
  const inherited = { PATH: "os-bin", TEMP: "os-temp", NODE_OPTIONS: "--import malicious.mjs", NODE_ENV: "production",
    DATABASE_URL: "postgresql://production", PG_PASSWORD: "secret", SESSION_SECRET: "secret", CI: "1",
    VISUAL_BASE_URL: "https://production.test", DOTENV_CONFIG_PATH: ".env", CHROME_PATH: "unexpected-browser" };
  const env = buildVisualBuiltEnvironment(inherited, "http://127.0.0.1:45678", disabled);
  assert.equal(env.PATH, "os-bin");
  assert.equal(env.TEMP, "os-temp");
  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.VISUAL_BASE_URL, "http://127.0.0.1:45678");
  assert.equal(env.DOTENV_CONFIG_PATH, disabled);
  assert.equal(env.PG_PORT, "1");
  for (const key of ["DATABASE_URL", "PG_PASSWORD", "SESSION_SECRET", "NODE_OPTIONS", "CI", "CHROME_PATH"]) assert.equal(env[key], undefined);
  for (const url of ["http://localhost:45678", "https://127.0.0.1:45678", "http://127.0.0.1:45678/path", "http://user@127.0.0.1:45678", "https://production.test"]) {
    assert.throws(() => buildVisualBuiltEnvironment({}, url, disabled));
  }
});

test("read-only loopback preview serves built SPA routes and assets but rejects API, mutation and secret paths", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "sqr-visual-static-test-"));
  let server;
  try {
    await writeFile(path.join(fixture, "index.html"), "<!doctype html><title>Synthetic visual test</title>");
    await mkdir(path.join(fixture, "assets"));
    await writeFile(path.join(fixture, "assets/app.js"), "export const synthetic = true;");
    await writeFile(path.join(fixture, ".env"), "SYNTHETIC_ONLY=not-a-secret");
    await writeFile(path.join(fixture, "source.map"), "synthetic map");
    server = await startVisualBuiltServer(fixture);
    assert.equal(new URL(server.origin).hostname, "127.0.0.1");
    for (const route of ["/", "/login", "/forgot-password", "/dashboard", "/settings?section=backup-restore", "/collection/save"]) {
      const response = await fetch(server.origin + route);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Synthetic visual test/);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    const asset = await fetch(`${server.origin}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /javascript/);
    assert.match(await asset.text(), /synthetic/);
    assert.equal(await (await fetch(`${server.origin}/assets/app.js`, { method: "HEAD" })).text(), "");
    for (const route of ["/api/me", "/api", "/ws", "/.env", "/.git/config", "/assets/%2e%2e%5c.env", "/source.map", "/missing.js", "/%00"]) {
      assert.equal((await fetch(server.origin + route)).status, 404, route);
    }
    assert.equal((await fetch(`${server.origin}/api/collection`, { method: "POST", body: "{}" })).status, 405);
  } finally {
    if (server) await server.close();
    await rm(fixture, { recursive: true, force: true });
  }
});

test("runner executes the verified installed CLI without shell, backend or dotenv and always closes its server", async () => {
  const source = await readFile(new URL("../test-visual-built.mjs", import.meta.url), "utf8");
  assert.match(source, /node_modules\/playwright\/cli\.js/);
  assert.match(source, /await realpath\(cliPath\), path\.resolve\(cliPath\)/);
  assert.match(source, /spawn\(process\.execPath, \[cliPath, "test", "tests\/visual\/", \.\.\.forwarded\]/);
  assert.match(source, /shell: false, windowsHide: true/);
  assert.match(source, /finally \{\s+await server\.close\(\)/);
  assert.match(source, /resolve\(code \?\? 1\)/);
  assert.match(source, /assert\.rejects\(access\(disabledDotenvPath\), \{ code: "ENOENT" \}\)/);
  assert.doesNotMatch(source, /import ["']dotenv|dist-local\/server|pg_ctl|initdb|\.\.\.process\.env|execSync|shell: true/);
});
