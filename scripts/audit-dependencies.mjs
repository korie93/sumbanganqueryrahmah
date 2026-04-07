import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  analyzeDependencyAuditReport,
  analyzePackageLockSources,
  analyzePackageOverrides,
} from "./lib/dependency-audit.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = ["audit", "--json"];
const npmExecPath = process.env.npm_execpath;
const result = npmExecPath
  ? spawnSync(process.execPath, [npmExecPath, ...npmArgs], { encoding: "utf8" })
  : spawnSync(npmCommand, npmArgs, {
      encoding: "utf8",
      shell: process.platform === "win32",
    });

if (result.error) {
  console.error(`Unable to run npm audit: ${result.error.message}`);
  process.exit(1);
}

let auditReport;
try {
  auditReport = JSON.parse(result.stdout || "{}");
} catch (error) {
  console.error("Unable to parse npm audit JSON output.");
  if (result.stderr) {
    console.error(result.stderr.trim());
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const { allowed, failures } = analyzeDependencyAuditReport(auditReport);
let packageSourceResult = { allowed: [], failures: [] };
let packageOverridesResult = { failures: [] };

try {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  packageOverridesResult = analyzePackageOverrides(packageJson);
  const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  packageSourceResult = analyzePackageLockSources(packageLock);
} catch (error) {
  console.error("Unable to inspect package dependency metadata.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (failures.length > 0 || packageSourceResult.failures.length > 0 || packageOverridesResult.failures.length > 0) {
  console.error("Dependency audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  for (const failure of packageSourceResult.failures) {
    console.error(`- ${failure}`);
  }
  for (const failure of packageOverridesResult.failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (allowed.length > 0) {
  console.warn("Dependency audit passed with documented dev-only exceptions:");
  for (const finding of allowed) {
    console.warn(`- ${finding.name} [${finding.severity}]: ${finding.reason}`);
  }
}

if (packageSourceResult.allowed.length > 0) {
  console.warn("Dependency audit passed with documented external package source exceptions:");
  for (const finding of packageSourceResult.allowed) {
    console.warn(`- ${finding.name}: ${finding.reason}`);
  }
}

if (allowed.length === 0 && packageSourceResult.allowed.length === 0) {
  console.log("Dependency audit passed with no moderate+ vulnerabilities.");
}
