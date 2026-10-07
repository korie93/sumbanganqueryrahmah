const severityRank = new Map([
  ["info", 0],
  ["low", 1],
  ["moderate", 2],
  ["high", 3],
  ["critical", 4],
]);

export const DEPENDENCY_AUDIT_TIMEOUT_MS = 120_000;
export const DEPENDENCY_AUDIT_MAX_BUFFER = 16 * 1024 * 1024;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAuditText(value) {
  return typeof value === "string" && value.trim().length > 0
    && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value);
}

function isStringList(value) {
  return Array.isArray(value) && value.every(isAuditText);
}

function hasValidCounts(value, keys) {
  return isRecord(value)
    && keys.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0);
}

function isValidVulnerability(name, vulnerability) {
  if (!isRecord(vulnerability) || !isAuditText(name) || name.length > 214
    || vulnerability.name !== name || !severityRank.has(vulnerability.severity)
    || typeof vulnerability.isDirect !== "boolean" || !isAuditText(vulnerability.range)
    || !isStringList(vulnerability.nodes) || vulnerability.nodes.length === 0
    || !isStringList(vulnerability.effects)
    || !Array.isArray(vulnerability.via) || vulnerability.via.length === 0) {
    return false;
  }

  const validVia = vulnerability.via.every((via) => typeof via === "string"
    ? isAuditText(via)
    : isRecord(via) && isAuditText(via.name) && isAuditText(via.dependency)
      && isAuditText(via.title) && isAuditText(via.url) && isAuditText(via.range)
      && severityRank.has(via.severity)
      && severityRank.get(via.severity) <= severityRank.get(vulnerability.severity));
  const fix = vulnerability.fixAvailable;
  const validFix = typeof fix === "boolean"
    || (isRecord(fix) && isAuditText(fix.name) && isAuditText(fix.version)
      && typeof fix.isSemVerMajor === "boolean");
  return validVia && validFix;
}

function validateDependencyAuditReport(report) {
  if (!isRecord(report)) {
    return "npm audit report must be a JSON object.";
  }
  // Never echo registry error payloads: they can contain credentials or log controls.
  if (Object.hasOwn(report, "error")) {
    return "npm audit reported an error; no complete audit result is available.";
  }
  if (report.auditReportVersion !== 2) {
    return "npm audit report has a missing or unsupported auditReportVersion (expected 2).";
  }
  if (!isRecord(report.vulnerabilities) || !isRecord(report.metadata)) {
    return "npm audit report must include vulnerability and metadata objects.";
  }

  const counts = report.metadata.vulnerabilities;
  const severityNames = [...severityRank.keys()];
  // Dependency categories overlap, and npm includes the root in prod but not
  // total. Validate their counts without assuming they sum to total.
  if (!hasValidCounts(counts, [...severityNames, "total"])
    || !hasValidCounts(report.metadata.dependencies, ["prod", "dev", "optional", "peer", "peerOptional", "total"])) {
    return "npm audit report contains missing or invalid metadata counts.";
  }

  const entries = Object.entries(report.vulnerabilities);
  const observedCounts = Object.fromEntries(severityNames.map((severity) => [severity, 0]));
  for (const [index, [name, vulnerability]] of entries.entries()) {
    if (!isValidVulnerability(name, vulnerability)) {
      return `npm audit report contains an invalid vulnerability entry at index ${index}.`;
    }
    observedCounts[vulnerability.severity] += 1;
  }

  if (counts.total !== entries.length
    || severityNames.some((severity) => counts[severity] !== observedCounts[severity])) {
    return "npm audit vulnerability metadata counts do not match the reported entries.";
  }

  const dependents = new Map(entries.map(([name]) => [name, []]));
  const backedByAdvisory = new Set();
  for (const [index, [name, vulnerability]] of entries.entries()) {
    for (const via of vulnerability.via) {
      if (typeof via !== "string") {
        backedByAdvisory.add(name);
        continue;
      }
      // npm aggregates a child's advisories across installed versions, while a
      // parent may inherit only one advisory. Their severities need not match.
      if (!Object.hasOwn(report.vulnerabilities, via)) {
        return `npm audit report contains an invalid vulnerability reference at index ${index}.`;
      }
      dependents.get(via).push(name);
    }
  }

  // Propagate advisory provenance iteratively, so deep chains and cycles remain
  // linear in the report size and cannot exhaust the JavaScript call stack.
  const pending = [...backedByAdvisory];
  for (let index = 0; index < pending.length; index += 1) {
    for (const name of dependents.get(pending[index])) {
      if (!backedByAdvisory.has(name)) {
        backedByAdvisory.add(name);
        pending.push(name);
      }
    }
  }
  if (backedByAdvisory.size !== entries.length) {
    return "npm audit report contains vulnerability references with no advisory source.";
  }
  return null;
}

function formatVulnerability(vulnerability) {
  const displayedNodes = vulnerability.nodes.slice(0, 5)
    .map((node) => node.length > 256 ? `${node.slice(0, 256)}...` : node);
  if (vulnerability.nodes.length > displayedNodes.length) {
    displayedNodes.push(`+${vulnerability.nodes.length - displayedNodes.length} more paths`);
  }
  return `${vulnerability.name} [${vulnerability.severity}] (${displayedNodes.join(", ")})`;
}

function getPackageNameFromPackagePath(packagePath) {
  const marker = "node_modules/";
  const nodeModulesIndex = packagePath.lastIndexOf(marker);
  if (nodeModulesIndex === -1) {
    return null;
  }

  const packagePathTail = packagePath.slice(nodeModulesIndex + marker.length);
  const parts = packagePathTail.split("/");
  if (parts[0]?.startsWith("@")) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }

  return parts[0] || null;
}

function isExternalPackageSource(resolved) {
  return /^https?:\/\//i.test(resolved) && !resolved.includes("registry.npmjs.org/");
}

const documentedOverrideReasons = new Map([
  [
    "@babel/core",
    "Pins the patched Babel 7 line for ESLint tooling until react-hooks resolves the fixed release transitively.",
  ],
  [
    "gaxios",
    "Pins the compatible patch that removes deprecated runtime cleanup dependencies from GCP metadata detection.",
  ],
  [
    "qs",
    "Pins patched query-string parsing behavior for transitive Express middleware until all upstream packages converge.",
  ],
  [
    "lodash",
    "Pins patched lodash template handling for transitive consumers and keeps npm audit clean across nested packages.",
  ],
  [
    "rollup",
    "Pins Rollup to a patched release used by the Vite toolchain and prevents vulnerable nested Rollup versions.",
  ],
  [
    "dompurify",
    "Pins DOMPurify sanitizer fixes for transitive HTML sanitization consumers.",
  ],
  [
    "esbuild",
    "Pins patched esbuild for dev/build tooling, including older drizzle-kit transitive @esbuild-kit packages.",
  ],
  [
    "ip-address",
    "Pins patched IP address parsing helpers for express-rate-limit until the upstream dependency advances.",
  ],
  [
    "js-yaml",
    "Pins patched YAML parsing for ESLint transitive config loading until @eslint/eslintrc resolves the patched range by default.",
  ],
  [
    "minimatch",
    "Pins the patched minimatch 10 line while legacy React ESLint plugins still request the vulnerable minimatch 3 range.",
  ],
]);

const securityCriticalDirectDependencies = Object.freeze([
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
]);

const documentedSecurityPatchRangePolicies = new Map([
  [
    "bcrypt",
    {
      pattern: /^\^6\.\d+\.\d+$/,
      reason: "Allows non-breaking bcrypt 6.x security patch updates while package-lock keeps installs reproducible.",
    },
  ],
]);

function isExactSemverSpecifier(value) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(value || ""));
}

function isDocumentedSecurityPatchRange(packageName, value) {
  const policy = documentedSecurityPatchRangePolicies.get(packageName);
  return Boolean(policy?.pattern.test(String(value || "")));
}

export function analyzeDependencyAuditReport(report) {
  const validationFailure = validateDependencyAuditReport(report);
  if (validationFailure) {
    return { allowed: [], failures: [validationFailure] };
  }
  const failures = [];

  for (const vulnerability of Object.values(report.vulnerabilities)) {
    if (severityRank.get(vulnerability.severity) >= severityRank.get("moderate")) {
      failures.push(formatVulnerability(vulnerability));
    }
  }

  return { allowed: [], failures };
}

export function analyzeDependencyAuditExecution(result) {
  const fail = (message) => ({ allowed: [], failures: [message] });
  if (!isRecord(result)) {
    return fail("npm audit did not return a process result.");
  }
  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      return fail("npm audit exceeded its execution timeout.");
    }
    if (result.error.code === "ENOBUFS") {
      return fail("npm audit exceeded its output buffer limit.");
    }
    return fail("Unable to execute npm audit successfully.");
  }
  if (result.signal != null) {
    return fail("npm audit was terminated by a signal.");
  }
  if (result.status !== 0 && result.status !== 1) {
    return fail("npm audit did not exit with a supported status (expected 0 or 1).");
  }
  if (typeof result.stdout !== "string" || !result.stdout.trim()) {
    return fail("npm audit returned no JSON report.");
  }
  if (Buffer.byteLength(result.stdout, "utf8") > DEPENDENCY_AUDIT_MAX_BUFFER) {
    return fail("npm audit exceeded its output buffer limit.");
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    return fail("npm audit returned invalid or truncated JSON.");
  }
  const analysis = analyzeDependencyAuditReport(report);
  if (result.status === 1 && analysis.failures.length === 0 && report.metadata.vulnerabilities.total === 0) {
    return fail("npm audit exited with status 1 but reported no vulnerabilities.");
  }
  return analysis;
}

export function analyzePackageOverrides(packageJson) {
  const overrides = packageJson?.overrides && typeof packageJson.overrides === "object"
    ? packageJson.overrides
    : {};
  const failures = [];

  for (const packageName of Object.keys(overrides).sort()) {
    if (!documentedOverrideReasons.has(packageName)) {
      failures.push(`${packageName} override is missing a documented reason`);
    }
  }

  return {
    documented: Object.fromEntries(documentedOverrideReasons.entries()),
    failures,
  };
}

export function analyzeSecurityCriticalDependencyPins(packageJson) {
  const dependencies = packageJson?.dependencies && typeof packageJson.dependencies === "object"
    ? packageJson.dependencies
    : {};
  const failures = [];

  for (const packageName of securityCriticalDirectDependencies) {
    const specifier = dependencies[packageName];
    if (typeof specifier !== "string") {
      failures.push(`${packageName} is missing from direct dependencies`);
      continue;
    }
    if (!isExactSemverSpecifier(specifier) && !isDocumentedSecurityPatchRange(packageName, specifier)) {
      failures.push(`${packageName} must be pinned to an exact version or documented security patch range, found "${specifier}"`);
    }
  }

  return {
    failures,
    packages: securityCriticalDirectDependencies,
    documentedPatchRanges: Object.fromEntries(
      Array.from(documentedSecurityPatchRangePolicies.entries()).map(([packageName, policy]) => [
        packageName,
        policy.reason,
      ]),
    ),
  };
}

export function analyzePackageLockSources(packageLock) {
  const packages = packageLock?.packages ?? {};
  const allowed = [];
  const failures = [];

  for (const [packagePath, metadata] of Object.entries(packages)) {
    const resolved = typeof metadata?.resolved === "string" ? metadata.resolved : "";
    if (!resolved || !isExternalPackageSource(resolved)) {
      continue;
    }

    const packageName = getPackageNameFromPackagePath(packagePath);
    failures.push(`${packageName || packagePath} resolved from external source ${resolved}`);
  }

  return { allowed, failures };
}
