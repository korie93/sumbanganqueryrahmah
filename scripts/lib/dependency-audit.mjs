const severityRank = new Map([
  ["info", 0],
  ["low", 1],
  ["moderate", 2],
  ["high", 3],
  ["critical", 4],
]);

function getSeverityScore(severity) {
  return severityRank.get(String(severity || "").toLowerCase()) ?? Number.POSITIVE_INFINITY;
}

function formatVulnerability(vulnerability) {
  const nodes = Array.isArray(vulnerability.nodes) && vulnerability.nodes.length > 0
    ? ` (${vulnerability.nodes.join(", ")})`
    : "";
  return `${vulnerability.name} [${vulnerability.severity}]${nodes}`;
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
  const vulnerabilities = Object.values(report?.vulnerabilities ?? {});
  const failures = [];

  for (const vulnerability of vulnerabilities) {
    if (getSeverityScore(vulnerability.severity) >= getSeverityScore("moderate")) {
      failures.push(formatVulnerability(vulnerability));
    }
  }

  return { allowed: [], failures };
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
