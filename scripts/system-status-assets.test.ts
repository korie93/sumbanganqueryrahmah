import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SystemStatusView } from "../client/src/components/system-status/SystemStatusView";
import { SYSTEM_STATUS_CONTENT, type SystemStatusKind } from "../shared/system-status";
import { createReleaseManifest } from "./lib/release-manifest.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const staticStates = ["502", "503", "504", "maintenance"] as const;
const staticFiles = [
  ...staticStates.map((state) => `deploy/errors/${state}.html`),
  "deploy/errors/assets/status.css", "deploy/errors/assets/status.js", "deploy/errors/assets/sqr-logo.svg",
];
const integrationFiles = [
  "deploy/nginx/sqr-error-pages-http.conf.example",
  "deploy/nginx/sqr-error-pages-server.conf.example",
  "deploy/nginx/sqr-error-pages-response-headers.conf.example",
  "docs/error-experience-nginx.md",
];
const read = (relative: string) => readFileSync(path.join(repository, relative), "utf8");

test("checked-in static error documents exactly match the shared view, copy, logo, and CSS", () => {
  const check = spawnSync(process.execPath, [require.resolve("tsx/cli"), "scripts/build-system-status.ts", "--check"], {
    cwd: repository, encoding: "utf8", timeout: 30_000, windowsHide: true,
  });
  assert.equal(check.error, undefined);
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  assert.match(check.stdout, /artifacts match their shared source/);
});

for (const state of Object.keys(SYSTEM_STATUS_CONTENT) as SystemStatusKind[]) {
  test(`${state} shared view renders semantic accessible status content without an application shell`, () => {
    const markup = renderToStaticMarkup(createElement(SystemStatusView, {
      state, primary: { label: "Kembali ke SQR", href: "/" },
    }));
    assert.equal((markup.match(/<main\b/g) ?? []).length, 1);
    assert.equal((markup.match(/<h1\b/g) ?? []).length, 1);
    assert.match(markup, new RegExp(`data-state="${state}"`));
    assert.match(markup, /aria-labelledby="system-status-title"/);
    assert.ok(markup.includes(SYSTEM_STATUS_CONTENT[state].title));
    assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.match(markup, /data-status-primary/);
    assert.doesNotMatch(markup, /<script\b|<iframe\b|<form\b/i);
  });
}

test("rendered administrator detail and feedback are escaped rather than interpreted as HTML", () => {
  const untrustedText = '<img src="x" onerror="window.injected=true">&';
  const markup = renderToStaticMarkup(createElement(SystemStatusView, {
    state: "maintenance", primary: { label: "Semak", onClick() {} },
    feedback: untrustedText,
    children: createElement("p", null, untrustedText),
  }));
  assert.doesNotMatch(markup, /<img src="x"|onerror="window\.injected/);
  assert.equal((markup.match(/&lt;img src=&quot;x&quot;/g) ?? []).length, 2);
});

test("busy manual recovery button is disabled, labelled, and non-submitting", () => {
  const markup = renderToStaticMarkup(createElement(SystemStatusView, {
    state: "502", primary: { label: "Cuba Semula", onClick() {} }, busy: true,
  }));
  assert.match(markup, /<button type="button" disabled="" aria-busy="true"/);
  assert.match(markup, /Menyemak sambungan/);
});

test("all static error pages have only local independent assets and small uncompressed payloads", () => {
  const assetBytes = staticFiles.filter((file) => file.includes("/assets/"))
    .reduce((total, file) => total + Buffer.byteLength(read(file)), 0);
  assert.ok(assetBytes < 32_768, `Shared independent assets exceed 32 KiB: ${assetBytes}`);
  for (const state of staticStates) {
    const html = read(`deploy/errors/${state}.html`);
    assert.ok(Buffer.byteLength(html) < 24_576, `${state} document exceeds 24 KiB`);
    assert.ok(Buffer.byteLength(html) + assetBytes < 49_152, `${state} cold page exceeds 48 KiB`);
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<html lang="ms">/);
    assert.match(html, /name="viewport"/);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.match(html, /<noscript>/, "Safe navigation must remain available without JavaScript.");
    assert.match(html, /<a href="\/"[^>]*data-status-primary/);
    assert.doesNotMatch(html, /<form\b|<iframe\b|<script\b[^>]*>[^<\s]|\son\w+=|http-equiv="refresh"/i);
    const references = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    for (const reference of references) {
      assert.ok(reference === "/" || reference === "/login" || reference.startsWith("/_sqr/errors/assets/"), reference);
      if (reference.startsWith("/_sqr/errors/assets/")) {
        assert.ok(existsSync(path.join(repository, "deploy/errors/assets", path.basename(reference))));
      }
    }
    assert.equal((html.match(/<script\b/g) ?? []).length, 1, "Only the independent recovery script should load.");
    assert.match(html, /<script defer src="\/_sqr\/errors\/assets\/status\.js"><\/script>/);
    assert.doesNotMatch(html, /(?:react-dom|vite|node_modules|fonts\.google|cdn\.)/i);
  }
  assert.doesNotMatch(read("deploy/errors/assets/status.css"), /@import|@font-face|url\s*\(/i);
  assert.doesNotMatch(read("deploy/errors/assets/status.js"), /\bimport\s*\(|\brequire\s*\(|\bsetInterval\s*\(/);
  assert.equal(read("deploy/errors/assets/sqr-logo.svg"), read("client/public/brand/sqr-logo-minimal.svg"));
});

test("release packaging copies and checksums independent error assets and scoped Nginx integration", () => {
  // Run the real packager against a tiny disposable fixture, not production or the actual build directory.
  const fixture = mkdtempSync(path.join(tmpdir(), "sqr-status-package-test-"));
  const output = path.join(fixture, "artifacts", "release", "package");
  const writeFixture = (relative: string, content: string) => {
    const destination = path.join(fixture, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  };
  try {
    const manifest = createReleaseManifest({ builtAt: "2026-09-19T00:00:00.000Z", commitSha: "a".repeat(40),
      sourceDirty: false, version: "1.0.0" });
    writeFixture("dist-local/release-manifest.json", JSON.stringify(manifest));
    writeFixture("package.json", JSON.stringify({ name: "status-fixture", scripts: { prepare: "never-run-this" } }));
    for (const relative of ["package-lock.json", "vendor/placeholder", "drizzle/placeholder",
      "scripts/db-migrate.mjs", "scripts/migrate-legacy-uploads.mjs", "scripts/lib/postgres-migration-lock.mjs",
      "scripts/lib/postgres-preflight.mjs", "scripts/post-deploy-health-check.sh",
      "deploy/pm2/ecosystem.release.config.cjs", "deploy/immutable/deploy-release.sh", "deploy/immutable/rollback-release.sh"]) {
      writeFixture(relative, "Disposable fixture only.\n");
    }
    for (const relative of [...staticFiles, ...integrationFiles]) {
      const destination = path.join(fixture, relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(path.join(repository, relative), destination);
    }
    writeFixture("unrelated-workspace-file.txt", "Must not be packaged.");
    const packaged = spawnSync(process.execPath, [path.join(repository, "scripts/prepare-release-package.mjs")], {
      cwd: fixture, encoding: "utf8", timeout: 30_000, windowsHide: true,
      env: { ...process.env, RELEASE_PACKAGE_DIR: "artifacts/release/package", SQR_ALLOW_DIRTY_RELEASE: "0" },
    });
    assert.equal(packaged.error, undefined);
    assert.equal(packaged.status, 0, `${packaged.stdout}\n${packaged.stderr}`);
    const checksums = readFileSync(path.join(output, "release-files.sha512"), "utf8");
    for (const relative of [...staticFiles, ...integrationFiles]) {
      const packagedBytes = readFileSync(path.join(output, relative));
      assert.deepEqual(packagedBytes, readFileSync(path.join(repository, relative)));
      const digest = createHash("sha512").update(packagedBytes).digest("hex");
      assert.ok(checksums.split(/\r?\n/).includes(`${digest}  ${relative}`), `Missing verified inventory entry: ${relative}`);
    }
    assert.equal(existsSync(path.join(output, "unrelated-workspace-file.txt")), false);
    assert.equal(JSON.parse(readFileSync(path.join(output, "package.json"), "utf8")).scripts.prepare, undefined);
  } finally {
    assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
    assert.ok(path.basename(fixture).startsWith("sqr-status-package-test-"));
    rmSync(fixture, { recursive: true, force: true });
  }
});
