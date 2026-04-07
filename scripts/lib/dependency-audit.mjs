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
]);

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
