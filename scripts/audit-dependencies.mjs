import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  analyzeDependencyAuditExecution,
  analyzePackageLockSources,
  analyzePackageOverrides,
  analyzeSecurityCriticalDependencyPins,
  DEPENDENCY_AUDIT_MAX_BUFFER,
  DEPENDENCY_AUDIT_TIMEOUT_MS,
} from "./lib/dependency-audit.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = ["audit", "--json"];
const npmExecPath = process.env.npm_execpath;
const spawnOptions = {
  encoding: "utf8",
  timeout: DEPENDENCY_AUDIT_TIMEOUT_MS,
  maxBuffer: DEPENDENCY_AUDIT_MAX_BUFFER,
  windowsHide: true,
};
const result = npmExecPath
  ? spawnSync(process.execPath, [npmExecPath, ...npmArgs], spawnOptions)
  : spawnSync(npmCommand, npmArgs, {
      ...spawnOptions,
      shell: process.platform === "win32",
    });

const { allowed, failures } = analyzeDependencyAuditExecution(result);
let packageSourceResult = { allowed: [], failures: [] };
let packageOverridesResult = { failures: [] };
let securityCriticalPinResult = { failures: [] };

try {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  packageOverridesResult = analyzePackageOverrides(packageJson);
  securityCriticalPinResult = analyzeSecurityCriticalDependencyPins(packageJson);
  const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  packageSourceResult = analyzePackageLockSources(packageLock);
} catch {
  console.error("Unable to inspect package dependency metadata.");
  process.exit(1);
}

if (
  failures.length > 0
  || packageSourceResult.failures.length > 0
  || packageOverridesResult.failures.length > 0
  || securityCriticalPinResult.failures.length > 0
) {
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
  for (const failure of securityCriticalPinResult.failures) {
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
