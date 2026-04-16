import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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

function toSha512Integrity(buffer) {
  return `sha512-${createHash("sha512").update(buffer).digest("base64")}`;
}

export const documentedOverrideMetadata = new Map([
  [
    "qs",
    {
      advisories: ["GHSA-hrpp-h998-j3pp", "CVE-2022-24999"],
      lastReviewedOn: "2026-04-15",
      reason: "Pins patched query-string parsing behavior for transitive Express middleware until all upstream packages converge.",
      reviewCadence: "quarterly",
    },
  ],
  [
    "lodash",
    {
      advisories: ["GHSA-35jh-r3h4-6jhm", "CVE-2021-23337", "GHSA-p6mc-m468-83gw", "CVE-2020-8203"],
      lastReviewedOn: "2026-04-15",
      reason: "Pins patched lodash template handling for transitive consumers and keeps npm audit clean across nested packages.",
      reviewCadence: "quarterly",
    },
  ],
  [
    "rollup",
    {
      advisories: ["GHSA-gcx4-mw62-g8wm", "CVE-2024-47068"],
      lastReviewedOn: "2026-04-15",
      reason: "Pins Rollup to a patched release used by the Vite toolchain and prevents vulnerable nested Rollup versions.",
      reviewCadence: "quarterly",
    },
  ],
  [
    "dompurify",
    {
      advisories: ["GHSA-p3vf-v8qc-cwcr", "CVE-2024-48910", "GHSA-39q2-94rc-95cp"],
      lastReviewedOn: "2026-04-16",
      reason: "Pins patched DOMPurify releases for the Trusted Types runtime and transitive HTML sanitization consumers.",
      reviewCadence: "quarterly",
    },
  ],
  [
    "esbuild",
    {
      advisories: ["GHSA-67mh-4wv8-2f99"],
      lastReviewedOn: "2026-04-15",
      reason: "Pins patched esbuild for dev/build tooling, including older drizzle-kit transitive @esbuild-kit packages.",
      reviewCadence: "quarterly",
    },
  ],
]);

export const vendoredPackagePolicies = new Map([
  [
    "xlsx",
    {
      dependencyPath: ["dependencies", "xlsx"],
      integrity: "sha512-+nKZ39+nvK7Qq6i0PvWWRA4j/EkfWOtkP/YhMtupm+lJIiHxUrgTr1CcKv1nBk1rHtkRRQ3O2+Ih/q/sA+FXZA==",
      lastReviewedOn: "2026-04-15",
      reason: "Uses the vendored SheetJS tarball so installs do not depend on the external CDN at release time.",
      resolved: "file:vendor/sheetjs/xlsx-0.20.2.tgz",
      reviewCadence: "quarterly",
      sourceUrl: "https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz",
    },
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
    const metadata = documentedOverrideMetadata.get(packageName);
    if (!metadata) {
      failures.push(`${packageName} override is missing a documented reason`);
      continue;
    }

    if (typeof metadata.reason !== "string" || metadata.reason.trim().length === 0) {
      failures.push(`${packageName} override is missing a documented reason`);
    }
    if (!Array.isArray(metadata.advisories) || metadata.advisories.length === 0) {
      failures.push(`${packageName} override is missing advisory metadata`);
    }
    if (metadata.reviewCadence !== "quarterly") {
      failures.push(`${packageName} override must declare quarterly review cadence`);
    }
    if (typeof metadata.lastReviewedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.lastReviewedOn)) {
      failures.push(`${packageName} override is missing a valid last-reviewed date`);
    }
  }

  return {
    documented: Object.fromEntries(documentedOverrideMetadata.entries()),
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

export function analyzeVendoredPackageSources(packageJson, packageLock, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const failures = [];

  for (const [packageName, policy] of vendoredPackagePolicies.entries()) {
    const [dependencyGroup, dependencyKey] = policy.dependencyPath;
    const packageJsonValue = packageJson?.[dependencyGroup]?.[dependencyKey];
    if (packageJsonValue !== policy.resolved) {
      failures.push(
        `${packageName} dependency must resolve to ${policy.resolved} in package.json (${dependencyGroup}.${dependencyKey})`,
      );
    }

    const packageLockEntry = packageLock?.packages?.[`node_modules/${packageName}`];
    if (!packageLockEntry || typeof packageLockEntry !== "object") {
      failures.push(`${packageName} is missing from package-lock.json packages metadata`);
      continue;
    }

    if (packageLockEntry.resolved !== policy.resolved) {
      failures.push(`${packageName} lockfile source must stay pinned to ${policy.resolved}`);
    }

    if (packageLockEntry.integrity !== policy.integrity) {
      failures.push(`${packageName} lockfile integrity must stay pinned to ${policy.integrity}`);
    }

    const tarballRelativePath = policy.resolved.replace(/^file:/, "");
    const tarballPath = path.resolve(cwd, tarballRelativePath);
    if (!existsSync(tarballPath)) {
      failures.push(`${packageName} vendored tarball is missing at ${tarballRelativePath}`);
      continue;
    }

    const actualIntegrity = toSha512Integrity(readFileSync(tarballPath));
    if (actualIntegrity !== policy.integrity) {
      failures.push(`${packageName} vendored tarball checksum mismatch: expected ${policy.integrity} but found ${actualIntegrity}`);
    }
  }

  return { failures };
}
