import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyPicomatchVendor, PICOMATCH_ADVISORY } from "../lib/picomatch-vendor.mjs";
import { analyzeDependencyAuditExecution } from "../lib/dependency-audit.mjs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
function report() {
  const advisory = { name: "picomatch", dependency: "picomatch", title: "Repeated extglob ReDoS", url: PICOMATCH_ADVISORY, severity: "high", range: "<=4.0.7" };
  const entry = (name, via) => ({ name, severity: "high", isDirect: false, via, effects: [], range: "*", nodes: [`node_modules/${name}`], fixAvailable: false });
  return { auditReportVersion: 2, vulnerabilities: { picomatch: entry("picomatch", [advisory]), vite: entry("vite", ["picomatch"]) },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 }, dependencies: { prod: 1, dev: 2, optional: 0, peer: 0, peerOptional: 0, total: 3 } } };
}
const analyze = (value, verified) => analyzeDependencyAuditExecution({ status: 1, signal: null, stdout: JSON.stringify(value) }, verified);

test("only installed, integrity-verified dev patch acknowledges the specific advisory", () => {
  const verified = verifyPicomatchVendor({ manifest, lock });
  assert.equal(analyze(report()).failures.length, 2);
  const result = analyze(report(), verified);
  assert.equal(result.failures.length, 0);
  assert.equal(result.allowed.length, 2);
  const captured = JSON.parse(readFileSync(new URL("./fixtures/picomatch-audit-2026-11-18.json", import.meta.url), "utf8"));
  assert.equal(analyze(captured).failures.length, 12);
  assert.equal(analyze(captured, verified).allowed.length, 12);
  assert.equal(analyze(captured, verified).failures.length, 0);
  for (const mutate of [
    value => { value.vulnerabilities.picomatch.via[0].url = "https://github.com/advisories/GHSA-new-advisory"; },
    value => { value.vulnerabilities.picomatch.via[0].range = "<=4.0.8"; },
    value => { value.vulnerabilities.picomatch.nodes.push("node_modules/vite/node_modules/picomatch"); },
    value => { value.vulnerabilities.picomatch.via.push({ ...value.vulnerabilities.picomatch.via[0], url: "https://github.com/advisories/GHSA-another" }); },
    value => { value.vulnerabilities.vite.via.push({ ...value.vulnerabilities.picomatch.via[0], name: "vite", dependency: "vite" }); },
  ]) {
    const value = report(); mutate(value);
    assert.ok(analyze(value, verified).failures.length > 0);
  }
  const runtimeLock = structuredClone(lock);
  runtimeLock.packages["node_modules/vite"].dev = false;
  assert.equal(analyze(report(), { ...verified, lock: runtimeLock }).failures.length, 1);
});

test("patch verifier rejects wrong metadata and additional copies", () => {
  for (const mutate of [
    value => { value.packages["node_modules/picomatch"].dev = false; },
    value => { value.packages["node_modules/picomatch"].integrity = "sha512-unpatched"; },
    value => { value.packages["node_modules/picomatch"].resolved = "https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz"; },
    value => { value.packages["node_modules/vite/node_modules/picomatch"] = value.packages["node_modules/picomatch"]; },
  ]) {
    const value = structuredClone(lock); mutate(value);
    assert.throws(() => verifyPicomatchVendor({ manifest, lock: value }));
  }
});

test("patch verifier rejects missing, altered or additional package files and altered vendor data", t => {
  const cwd = mkdtempSync(path.join(tmpdir(), "sqr-picomatch-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  cpSync("vendor/picomatch", path.join(cwd, "vendor/picomatch"), { recursive: true });
  cpSync("vendor/picomatch/package", path.join(cwd, "node_modules/picomatch"), { recursive: true });
  assert.ok(verifyPicomatchVendor({ cwd, manifest, lock }));
  for (const relative of ["node_modules/picomatch/lib/parse.js", "vendor/picomatch/files.sha256.json", "vendor/picomatch/picomatch-4.0.7-sqr.2.tgz"]) {
    const file = path.join(cwd, relative), bytes = readFileSync(file);
    rmSync(file); // The sandbox source copy deliberately has read-only modes.
    writeFileSync(file, "tampered");
    assert.throws(() => verifyPicomatchVendor({ cwd, manifest, lock }));
    writeFileSync(file, bytes);
  }
  const extra = path.join(cwd, "node_modules/picomatch/extra.js");
  writeFileSync(extra, "");
  assert.throws(() => verifyPicomatchVendor({ cwd, manifest, lock }));
  rmSync(extra);
  rmSync(path.join(cwd, "node_modules/picomatch/index.js"));
  assert.throws(() => verifyPicomatchVendor({ cwd, manifest, lock }));
});

test("clean offline npm ci installs the local patch and the real audit CLI verifies it", { timeout: 30000 }, t => {
  const cwd = mkdtempSync(path.join(tmpdir(), "sqr-picomatch-install-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  cpSync("vendor/picomatch", path.join(cwd, "vendor/picomatch"), { recursive: true });
  const npm = [process.env.npm_execpath,
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")].find(file => file && existsSync(file));
  assert.ok(npm, "npm must be available for offline clean-install verification");
  const pkg = { name: "sqr-picomatch-offline-fixture", version: "1.0.0", devDependencies: { picomatch: manifest.devDependencies.picomatch }, overrides: { picomatch: "$picomatch" } };
  const fixtureLock = { name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true,
    packages: { "": { name: pkg.name, version: pkg.version, devDependencies: pkg.devDependencies }, "node_modules/picomatch": lock.packages["node_modules/picomatch"] } };
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify(pkg));
  writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify(fixtureLock));
  const installed = spawnSync(process.execPath, [npm, "ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", path.join(cwd, "cache")], { cwd, encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(installed.status, 0, installed.stderr);
  assert.ok(verifyPicomatchVendor({ cwd, manifest: pkg, lock: fixtureLock }));
  // Exercise the actual gate with the complete project metadata and synthetic
  // advisory response, without registry access or installation of other packages.
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify(manifest));
  writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify(lock));
  const stub = path.join(cwd, "npm-stub.cjs");
  const captured = readFileSync(new URL("./fixtures/picomatch-audit-2026-11-18.json", import.meta.url), "utf8");
  writeFileSync(stub, `process.stdout.write(${JSON.stringify(captured)}); process.exitCode=1;`);
  const run = () => spawnSync(process.execPath, [fileURLToPath(new URL("../audit-dependencies.mjs", import.meta.url))], { cwd, env: { ...process.env, npm_execpath: stub }, encoding: "utf8", timeout: 5000, windowsHide: true });
  const passed = run();
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stderr, /verified dev-only source patches/);
  writeFileSync(path.join(cwd, "node_modules/picomatch/lib/parse.js"), "unpatched");
  const failed = run();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Unable to verify the local Picomatch/);
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify(pkg));
  writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify(fixtureLock));
  const production = spawnSync(process.execPath, [npm, "ci", "--omit=dev", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", path.join(cwd, "cache")], { cwd, encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(production.status, 0, production.stderr);
  assert.equal(existsSync(path.join(cwd, "node_modules/picomatch")), false, "production install must omit patched dev tooling");
});
