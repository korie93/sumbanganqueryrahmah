const severityRank = new Map([
  ["info", 0],
  ["low", 1],
  ["moderate", 2],
  ["high", 3],
  ["critical", 4],
]);

const allowedModerateDevFindings = {
  "@esbuild-kit/core-utils": new Set(["node_modules/@esbuild-kit/core-utils"]),
  "@esbuild-kit/esm-loader": new Set(["node_modules/@esbuild-kit/esm-loader"]),
  "drizzle-kit": new Set(["node_modules/drizzle-kit"]),
  "esbuild": new Set(["node_modules/@esbuild-kit/core-utils/node_modules/esbuild"]),
};

const allowedExternalPackageSources = {
  "xlsx": {
    resolved: new Set(["https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz"]),
    reason: "SheetJS 0.20.2 is distributed from the vendor CDN; replace with an internal mirror/vendor tarball when available",
  },
};

function getSeverityScore(severity) {
  return severityRank.get(String(severity || "").toLowerCase()) ?? Number.POSITIVE_INFINITY;
}

function isAllowedDrizzleKitDevFinding(vulnerability) {
  const allowedNodes = allowedModerateDevFindings[vulnerability.name];
  if (!allowedNodes || vulnerability.severity !== "moderate") {
    return false;
  }

  const nodes = Array.isArray(vulnerability.nodes) ? vulnerability.nodes : [];
  return nodes.length > 0 && nodes.every((node) => allowedNodes.has(node));
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

export function analyzeDependencyAuditReport(report) {
  const vulnerabilities = Object.values(report?.vulnerabilities ?? {});
  const allowed = [];
  const failures = [];

  for (const vulnerability of vulnerabilities) {
    if (isAllowedDrizzleKitDevFinding(vulnerability)) {
      allowed.push({
        name: vulnerability.name,
        severity: vulnerability.severity,
        nodes: vulnerability.nodes,
        reason: "dev-only drizzle-kit stable release still depends on deprecated @esbuild-kit packages",
      });
      continue;
    }

    if (getSeverityScore(vulnerability.severity) >= getSeverityScore("moderate")) {
      failures.push(formatVulnerability(vulnerability));
    }
  }

  return { allowed, failures };
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
    const allowedSource = packageName ? allowedExternalPackageSources[packageName] : undefined;
    if (allowedSource?.resolved.has(resolved)) {
      allowed.push({
        name: packageName,
        resolved,
        reason: allowedSource.reason,
      });
      continue;
    }

    failures.push(`${packageName || packagePath} resolved from external source ${resolved}`);
  }

  return { allowed, failures };
}
