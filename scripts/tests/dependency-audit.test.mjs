import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzeDependencyAuditReport,
  analyzePackageLockSources,
  analyzePackageOverrides,
  analyzeVendoredPackageSources,
  documentedOverrideMetadata,
  vendoredPackagePolicies,
} from "../lib/dependency-audit.mjs";

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
  assert.match(result.documented.qs.reason, /query-string/i);
  assert.equal(result.documented.qs.reviewCadence, "quarterly");
  assert.ok(result.documented.qs.advisories.includes("CVE-2022-24999"));
});

test("package override audit accepts documented override set", () => {
  const result = analyzePackageOverrides({
    overrides: {
      qs: "^6.15.0",
      lodash: "^4.17.23",
      rollup: "^4.59.0",
      dompurify: "^3.4.0",
      esbuild: "^0.25.4",
    },
  });

  assert.deepEqual(result.failures, []);
});

test("package override audit rejects incomplete advisory metadata", () => {
  const originalMetadata = { ...documentedOverrideMetadata.get("qs") };
  try {
    documentedOverrideMetadata.set("qs", {
      ...originalMetadata,
      advisories: [],
    });

    const result = analyzePackageOverrides({
      overrides: {
        qs: "^6.15.0",
      },
    });

    assert.deepEqual(result.failures, ["qs override is missing advisory metadata"]);
  } finally {
    documentedOverrideMetadata.set("qs", originalMetadata);
  }
});

test("vendored package audit accepts matching lockfile and tarball checksum", () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "sqr-vendor-audit-"));
  const originalPolicy = { ...vendoredPackagePolicies.get("xlsx") };

  try {
    const tarballContents = Buffer.from("sheetjs-fixture");
    const vendoredDir = path.join(fixtureDir, "vendor", "sheetjs");
    mkdirSync(vendoredDir, { recursive: true });
    writeFileSync(path.join(vendoredDir, "xlsx-0.20.2.tgz"), tarballContents);

    vendoredPackagePolicies.set("xlsx", {
      ...originalPolicy,
      integrity: toIntegrity(tarballContents),
    });

    const result = analyzeVendoredPackageSources(
      {
        dependencies: {
          xlsx: "file:vendor/sheetjs/xlsx-0.20.2.tgz",
        },
      },
      {
        packages: {
          "node_modules/xlsx": {
            integrity: toIntegrity(tarballContents),
            resolved: "file:vendor/sheetjs/xlsx-0.20.2.tgz",
          },
        },
      },
      { cwd: fixtureDir },
    );

    assert.deepEqual(result.failures, []);
  } finally {
    vendoredPackagePolicies.set("xlsx", originalPolicy);
    rmSync(fixtureDir, { force: true, recursive: true });
  }
});

test("vendored package audit rejects checksum drift", () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "sqr-vendor-audit-"));

  try {
    const vendoredDir = path.join(fixtureDir, "vendor", "sheetjs");
    mkdirSync(vendoredDir, { recursive: true });
    writeFileSync(path.join(vendoredDir, "xlsx-0.20.2.tgz"), "tampered", "utf8");

    const result = analyzeVendoredPackageSources(
      {
        dependencies: {
          xlsx: "file:vendor/sheetjs/xlsx-0.20.2.tgz",
        },
      },
      {
        packages: {
          "node_modules/xlsx": {
            integrity: "sha512-+nKZ39+nvK7Qq6i0PvWWRA4j/EkfWOtkP/YhMtupm+lJIiHxUrgTr1CcKv1nBk1rHtkRRQ3O2+Ih/q/sA+FXZA==",
            resolved: "file:vendor/sheetjs/xlsx-0.20.2.tgz",
          },
        },
      },
      { cwd: fixtureDir },
    );

    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /vendored tarball checksum mismatch/i);
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
});

function toIntegrity(buffer) {
  return `sha512-${createHash("sha512").update(buffer).digest("base64")}`;
}
