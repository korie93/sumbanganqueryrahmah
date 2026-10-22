import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  analyzeDependencyAuditExecution,
  analyzePackageLockSources,
  analyzePackageOverrides,
  analyzeSecurityCriticalDependencyPins,
  DEPENDENCY_AUDIT_FETCH_TIMEOUT_MS,
  DEPENDENCY_AUDIT_MAX_BUFFER,
  DEPENDENCY_AUDIT_TIMEOUT_MS,
  runDependencyAuditWithRetry,
} from "./lib/dependency-audit.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
// Keep npm's HTTP budget below our process cap. Its default HTTP timeout is
// longer than that cap; outer retries below are bounded and fail closed.
const npmArgs = ["audit", "--json", `--fetch-timeout=${DEPENDENCY_AUDIT_FETCH_TIMEOUT_MS}`, "--fetch-retries=0"];
const npmExecPath = process.env.npm_execpath;
const spawnOptions = {
  encoding: "utf8",
  timeout: DEPENDENCY_AUDIT_TIMEOUT_MS,
  maxBuffer: DEPENDENCY_AUDIT_MAX_BUFFER,
  killSignal: "SIGKILL",
  windowsHide: true,
};
const result = await runDependencyAuditWithRetry(() => npmExecPath
  ? spawnSync(process.execPath, [npmExecPath, ...npmArgs], spawnOptions)
  : spawnSync(npmCommand, npmArgs, {
      ...spawnOptions,
      shell: process.platform === "win32",
    }), {
  onRetry: (attempt, maximum) => console.warn(`Dependency audit temporary transport failure; retrying (${attempt}/${maximum}).`),
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
