import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startPasswordPublicBuildServer } from "../lib/password-public-build-server.mjs";

test("public build server serves actual static assets and only explicitly allowed SPA routes", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "sqr-public-build-test-"));
  const publicDirectory = path.join(fixture, "public");
  let server;
  try {
    await mkdir(publicDirectory);
    await writeFile(path.join(publicDirectory, "index.html"), "<!doctype html><title>Synthetic public build</title>");
    await writeFile(path.join(publicDirectory, "entry.js"), "export const fixture = true;");
    await writeFile(path.join(publicDirectory, "entry.css"), ".fixture { color: green; }");
    await writeFile(path.join(fixture, "outside.txt"), "Synthetic outside fixture");
    await mkdir(path.join(fixture, "outside"));
    await writeFile(path.join(fixture, "outside", "index.html"), "Synthetic outside fixture");
    await symlink(path.join(fixture, "outside"), path.join(publicDirectory, "outside-link"), "junction");
    server = await startPasswordPublicBuildServer(publicDirectory);
    for (const route of ["/reset-password?token=fixture", "/activate-account?token=fixture"]) {
      const response = await fetch(`${server.origin}${route}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(await response.text(), /Synthetic public build/);
    }
    for (const [asset, mime] of [["entry.css", "text/css"], ["entry.js", "text/javascript"]]) {
      const response = await fetch(`${server.origin}/${asset}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get("content-type").startsWith(mime));
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    }
    for (const url of ["/.env", "/missing.css", "/api/auth/reset-password-with-token", "/unknown-route", "/..%2foutside.txt", "/..%5coutside.txt", "/outside-link/index.html"]) {
      assert.equal((await fetch(`${server.origin}${url}`)).status, 404, `${url} must not expose outside files or substitute an HTML success.`);
    }
    assert.equal((await fetch(`${server.origin}/reset-password`, { method: "POST" })).status, 405);
  } finally {
    await server?.close();
    // Only the exact mkdtemp-created test fixture is removed, never a project path.
    await rm(fixture, { recursive: true, force: true });
  }
});

test("public password browser gate uses emitted app files, not Vite or the authenticated CSS fixture", () => {
  const runner = readFileSync("scripts/password-public-build-browser.mjs", "utf8");
  const server = readFileSync("scripts/lib/password-public-build-server.mjs", "utf8");
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.equal(scripts["test:auth:public-build"], "node scripts/password-public-build-browser.mjs");
  assert.match(runner, /startPasswordPublicBuildServer\(path\.join\(root, "dist-local\/public"\)\)/);
  assert.match(runner, /\[320, 360, 390, 430, 768, 1280\]/);
  assert.match(runner, /\["light", "dark"\]/);
  assert.match(runner, /AuthenticatedApp/);
  assert.match(runner, /serviceWorkers: "block"/);
  assert.match(runner, /window\.axe\.run/);
  assert.match(runner, /240_000/);
  assert.match(runner, /url\.origin !== server\.origin/);
  assert.match(server, /server\.listen\(0, "127\.0\.0\.1"/);
  assert.doesNotMatch(runner, /from "vite"|auth-feedback-ui|index\.css|dotenv|process\.env\.SMOKE_BASE_URL/);
});

test("CI and release readiness execute the built-public gate after build and preserve failure screenshots", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const smoke = ci.slice(ci.indexOf("  smoke-ui:"));
  const release = readFileSync("scripts/release-readiness-local.mjs", "utf8");
  const releaseWorkflow = readFileSync(".github/workflows/release-verification.yml", "utf8");
  const ciBuild = smoke.indexOf("run: npm run build");
  const ciGate = smoke.indexOf("run: npm run test:auth:public-build");
  assert.ok(ciBuild >= 0 && ciGate > ciBuild && ciGate < smoke.indexOf("- name: Start built server"));
  assert.match(smoke, /name: Verify actual built public password pages\s+timeout-minutes: 5\s+run: npm run test:auth:public-build/);
  const releaseBuild = release.indexOf('["run", "build"]');
  const releaseGate = release.indexOf('["run", "test:auth:public-build"]');
  assert.ok(releaseBuild >= 0 && releaseGate > releaseBuild && releaseGate < release.indexOf("const serverProcess = startManagedServerProcess("));
  for (const source of [smoke, releaseWorkflow]) {
    assert.match(source, /if: always\(\)[\s\S]*artifacts\/password-public-build-browser/);
  }
});
