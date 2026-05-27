import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildCycloneDxSbomFromPackageLock,
  buildSpdxSbomFromPackageLock,
  validateSbomDocument,
} from "./lib/sbom.mjs";

const outputDirectory = path.resolve(process.env.SBOM_ARTIFACTS_DIR || "artifacts/sbom");
const packageLockPath = path.resolve("package-lock.json");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const sbomTargets = [
  {
    fileName: "sbom.cyclonedx.json",
    format: "cyclonedx",
  },
  {
    fileName: "sbom.spdx.json",
    format: "spdx",
  },
];

function runNpmSbom(format) {
  const result = spawnSync(npmCommand, [
    "sbom",
    "--package-lock-only",
    "--sbom-format",
    format,
    "--sbom-type",
    "application",
  ], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || "npm sbom failed without output";
    return {
      document: null,
      error: detail,
    };
  }

  try {
    return {
      document: JSON.parse(result.stdout),
      error: null,
    };
  } catch (error) {
    return {
      document: null,
      error: `Unable to parse ${format} SBOM JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildFallbackSbom(format) {
  const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
  return format === "cyclonedx"
    ? buildCycloneDxSbomFromPackageLock(packageLock)
    : buildSpdxSbomFromPackageLock(packageLock);
}

mkdirSync(outputDirectory, { recursive: true });

for (const target of sbomTargets) {
  const generated = runNpmSbom(target.format);
  const document = generated.document || buildFallbackSbom(target.format);
  const summary = validateSbomDocument(document, { format: target.format });
  const outputPath = path.join(outputDirectory, target.fileName);
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
  if (generated.error) {
    console.warn(`npm sbom ${target.format} failed; used package-lock fallback: ${generated.error}`);
  }
  console.log(`Generated ${target.format} SBOM with ${summary.packageCount} packages: ${outputPath}`);
}
