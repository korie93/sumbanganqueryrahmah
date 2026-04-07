import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDependencyAuditReport, analyzePackageLockSources } from "../lib/dependency-audit.mjs";

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
