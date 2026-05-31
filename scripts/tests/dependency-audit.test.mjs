import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  analyzeDependencyAuditReport,
  analyzePackageLockSources,
  analyzePackageOverrides,
  analyzeSecurityCriticalDependencyPins,
} from "../lib/dependency-audit.mjs";

const repoRoot = process.cwd();

test("dependency audit fails the old drizzle-kit dev-only moderate chain after esbuild override", () => {
  const result = analyzeDependencyAuditReport({
    vulnerabilities: {
      "drizzle-kit": {
        name: "drizzle-kit",
        severity: "moderate",
        nodes: ["node_modules/drizzle-kit"],
      },
      "esbuild": {
        name: "esbuild",
        severity: "moderate",
        nodes: ["node_modules/@esbuild-kit/core-utils/node_modules/esbuild"],
      },
    },
  });

  assert.deepEqual(result.failures, [
    "drizzle-kit [moderate] (node_modules/drizzle-kit)",
    "esbuild [moderate] (node_modules/@esbuild-kit/core-utils/node_modules/esbuild)",
  ]);
  assert.equal(result.allowed.length, 0);
});

test("dependency audit fails unrelated moderate vulnerabilities", () => {
  const result = analyzeDependencyAuditReport({
    vulnerabilities: {
      "example-package": {
        name: "example-package",
        severity: "moderate",
        nodes: ["node_modules/example-package"],
      },
    },
  });

  assert.deepEqual(result.failures, ["example-package [moderate] (node_modules/example-package)"]);
});

test("dependency audit fails high severity even if package name is allowlisted", () => {
  const result = analyzeDependencyAuditReport({
    vulnerabilities: {
      "drizzle-kit": {
        name: "drizzle-kit",
        severity: "high",
        nodes: ["node_modules/drizzle-kit"],
      },
    },
  });

  assert.deepEqual(result.failures, ["drizzle-kit [high] (node_modules/drizzle-kit)"]);
});

test("package source audit fails the old SheetJS CDN tarball after vendoring", () => {
  const result = analyzePackageLockSources({
    packages: {
      "node_modules/xlsx": {
        resolved: "https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz",
      },
    },
  });

  assert.deepEqual(result.failures, [
    "xlsx resolved from external source https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz",
  ]);
  assert.equal(result.allowed.length, 0);
});

test("package source audit ignores vendored file dependencies", () => {
  const result = analyzePackageLockSources({
    packages: {
      "node_modules/xlsx": {
        resolved: "file:vendor/sheetjs/xlsx-0.20.2.tgz",
      },
    },
  });

  assert.equal(result.failures.length, 0);
  assert.equal(result.allowed.length, 0);
});

test("package source audit fails unexpected external tarballs", () => {
  const result = analyzePackageLockSources({
    packages: {
      "node_modules/example-package": {
        resolved: "https://example.com/example-package-1.0.0.tgz",
      },
    },
  });

  assert.deepEqual(result.failures, [
    "example-package resolved from external source https://example.com/example-package-1.0.0.tgz",
  ]);
});

test("package override audit requires every override to be documented", () => {
  const result = analyzePackageOverrides({
    overrides: {
      qs: "^6.15.0",
      "undocumented-package": "^1.0.0",
    },
  });

  assert.deepEqual(result.failures, [
    "undocumented-package override is missing a documented reason",
  ]);
  assert.match(result.documented.qs, /query-string/);
});

test("package override audit accepts documented override set", () => {
  const result = analyzePackageOverrides({
    overrides: {
      qs: "^6.15.0",
      lodash: "^4.17.23",
      rollup: "^4.59.0",
      dompurify: "3.4.1",
      esbuild: "^0.25.4",
      "ip-address": "^10.2.0",
    },
  });

  assert.deepEqual(result.failures, []);
});

test("package override runbook lists the current package overrides", () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const runbook = readFileSync(path.join(repoRoot, "docs", "DEPENDENCY_SUPPLY_CHAIN.md"), "utf8");

  for (const packageName of Object.keys(packageJson.overrides ?? {})) {
    assert.match(runbook, new RegExp(`\\| \`${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\` \\|`));
  }

  assert.doesNotMatch(runbook, /\| `dompurify` \|/);
});

test("security-critical dependency audit requires exact direct pins except documented patch ranges", () => {
  const result = analyzeSecurityCriticalDependencyPins({
    dependencies: {
      bcrypt: "^6.0.0",
      busboy: "^1.6.0",
      compression: "1.8.1",
      dompurify: "3.4.1",
      dotenv: "16.6.1",
      "drizzle-orm": "0.45.2",
      "drizzle-zod": "0.7.1",
      express: "5.2.1",
      "express-rate-limit": "8.4.1",
      helmet: "8.1.0",
      jsonwebtoken: "9.0.3",
      nodemailer: "8.0.6",
      pg: "8.20.0",
      pino: "10.3.1",
      redis: "5.12.1",
      ws: "8.20.1",
      zod: "3.25.76",
    },
  });

  assert.match(result.failures.join("\n"), /busboy must be pinned to an exact version/);
  assert.match(result.failures.join("\n"), /zod-validation-error is missing from direct dependencies/);
  assert.doesNotMatch(result.failures.join("\n"), /bcrypt/);
  assert.match(result.documentedPatchRanges.bcrypt, /security patch/i);
});

test("security-critical dependency audit accepts exact direct pins and documented bcrypt patch range", () => {
  const result = analyzeSecurityCriticalDependencyPins({
    dependencies: {
      ...Object.fromEntries([
      "bcrypt",
      "busboy",
      "compression",
      "dompurify",
      "dotenv",
      "drizzle-orm",
      "drizzle-zod",
      "express",
      "express-rate-limit",
      "helmet",
      "jsonwebtoken",
      "nodemailer",
      "pg",
      "pino",
      "redis",
      "ws",
      "zod",
      "zod-validation-error",
      ].map((packageName) => [packageName, "1.2.3"])),
      bcrypt: "^6.0.0",
    },
  });

  assert.deepEqual(result.failures, []);
});
