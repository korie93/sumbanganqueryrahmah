import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildCycloneDxSbomFromPackageLock,
  buildSpdxSbomFromPackageLock,
  getSbomPackageCount,
  validateSbomDocument,
} from "../lib/sbom.mjs";

test("validateSbomDocument accepts non-empty CycloneDX and SPDX documents", () => {
  assert.deepEqual(
    validateSbomDocument({
      bomFormat: "CycloneDX",
      components: [{ name: "sqr-local", version: "1.0.0" }],
    }, {
      format: "cyclonedx",
    }),
    {
      format: "cyclonedx",
      packageCount: 1,
    },
  );

  assert.deepEqual(
    validateSbomDocument({
      packages: [{ name: "sqr-local", versionInfo: "1.0.0" }],
      spdxVersion: "SPDX-2.3",
    }, {
      format: "spdx",
    }),
    {
      format: "spdx",
      packageCount: 1,
    },
  );
});

test("validateSbomDocument rejects empty or malformed SBOMs", () => {
  assert.throws(
    () => validateSbomDocument({ bomFormat: "CycloneDX", components: [] }, { format: "cyclonedx" }),
    /SBOM is empty/,
  );
  assert.throws(
    () => validateSbomDocument({ components: [{ name: "x" }] }, { format: "cyclonedx" }),
    /missing bomFormat/,
  );
  assert.throws(
    () => validateSbomDocument({ packages: [{ name: "x" }] }, { format: "spdx" }),
    /missing spdxVersion/,
  );
});

test("getSbomPackageCount supports CycloneDX components and SPDX packages", () => {
  assert.equal(getSbomPackageCount({ components: [{}, {}] }), 2);
  assert.equal(getSbomPackageCount({ packages: [{}] }), 1);
  assert.equal(getSbomPackageCount({}), 0);
});

test("release workflow generates and uploads SBOM artifacts", () => {
  const workflow = readFileSync(
    path.resolve(process.cwd(), ".github", "workflows", "release-verification.yml"),
    "utf8",
  );

  assert.match(workflow, /Generate SBOM/);
  assert.match(workflow, /SBOM_ARTIFACTS_DIR=artifacts\/sbom npm run supply-chain:sbom/);
  assert.match(workflow, /artifacts\/sbom/);
});

test("package-lock fallback builders produce valid CycloneDX and SPDX SBOMs", () => {
  const packageLock = {
    name: "sqr-local",
    packages: {
      "": {
        name: "sqr-local",
        version: "1.0.0",
      },
      "node_modules/@scope/example": {
        version: "1.2.3",
      },
      "node_modules/plain": {
        version: "4.5.6",
      },
    },
    version: "1.0.0",
  };

  const cyclonedx = buildCycloneDxSbomFromPackageLock(packageLock);
  const spdx = buildSpdxSbomFromPackageLock(packageLock);

  assert.equal(cyclonedx.bomFormat, "CycloneDX");
  assert.equal(cyclonedx.components.length, 2);
  assert.equal(spdx.spdxVersion, "SPDX-2.3");
  assert.equal(spdx.packages.length, 2);
  assert.deepEqual(validateSbomDocument(cyclonedx, { format: "cyclonedx" }).packageCount, 2);
  assert.deepEqual(validateSbomDocument(spdx, { format: "spdx" }).packageCount, 2);
});
