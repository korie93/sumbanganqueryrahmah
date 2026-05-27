export function getSbomPackageCount(document) {
  if (!document || typeof document !== "object") {
    return 0;
  }

  if (Array.isArray(document.components)) {
    return document.components.length;
  }

  if (Array.isArray(document.packages)) {
    return document.packages.length;
  }

  return 0;
}

function getPackageNameFromLockPath(packagePath) {
  const segments = String(packagePath || "").split("/");
  const nodeModulesIndex = segments.lastIndexOf("node_modules");
  if (nodeModulesIndex < 0 || nodeModulesIndex >= segments.length - 1) {
    return "";
  }

  const firstNameSegment = segments[nodeModulesIndex + 1];
  if (firstNameSegment?.startsWith("@")) {
    const secondNameSegment = segments[nodeModulesIndex + 2];
    return secondNameSegment ? `${firstNameSegment}/${secondNameSegment}` : "";
  }

  return firstNameSegment || "";
}

function getLockPackages(packageLock) {
  return Object.entries(packageLock?.packages || {})
    .filter(([packagePath, metadata]) =>
      packagePath !== "" && metadata && typeof metadata === "object" && metadata.version)
    .map(([packagePath, metadata]) => ({
      name: metadata.name || getPackageNameFromLockPath(packagePath),
      packagePath,
      version: metadata.version,
    }))
    .filter((entry) => entry.name)
    .sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`));
}

function sanitizeSpdxId(value) {
  return String(value).replace(/[^A-Za-z0-9.-]/g, "-");
}

export function buildCycloneDxSbomFromPackageLock(packageLock) {
  const rootPackage = packageLock?.packages?.[""] || {};
  const components = getLockPackages(packageLock).map((entry) => ({
    bomRef: `pkg:npm/${entry.name}@${entry.version}`,
    name: entry.name,
    purl: `pkg:npm/${entry.name}@${entry.version}`,
    type: "library",
    version: entry.version,
  }));

  return {
    bomFormat: "CycloneDX",
    components,
    metadata: {
      component: {
        name: rootPackage.name || packageLock?.name || "sqr-local",
        type: "application",
        version: rootPackage.version || packageLock?.version || "0.0.0",
      },
    },
    specVersion: "1.5",
    version: 1,
  };
}

export function buildSpdxSbomFromPackageLock(packageLock) {
  const rootPackage = packageLock?.packages?.[""] || {};
  const rootName = rootPackage.name || packageLock?.name || "sqr-local";
  const packages = getLockPackages(packageLock).map((entry) => ({
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    name: entry.name,
    SPDXID: `SPDXRef-Package-${sanitizeSpdxId(`${entry.name}-${entry.version}`)}`,
    versionInfo: entry.version,
  }));

  return {
    creationInfo: {
      created: new Date(0).toISOString(),
      creators: ["Tool: SQR npm package-lock SBOM fallback"],
    },
    dataLicense: "CC0-1.0",
    documentNamespace: `https://sqr-system.local/sbom/${sanitizeSpdxId(rootName)}`,
    name: `${rootName} SBOM`,
    packages,
    SPDXID: "SPDXRef-DOCUMENT",
    spdxVersion: "SPDX-2.3",
  };
}

export function validateSbomDocument(document, { format }) {
  const packageCount = getSbomPackageCount(document);
  const normalizedFormat = String(format || "").toLowerCase();

  if (packageCount <= 0) {
    throw new Error(`${format} SBOM is empty.`);
  }

  if (normalizedFormat === "cyclonedx" && document.bomFormat !== "CycloneDX") {
    throw new Error("CycloneDX SBOM is missing bomFormat=CycloneDX.");
  }

  if (normalizedFormat === "spdx" && typeof document.spdxVersion !== "string") {
    throw new Error("SPDX SBOM is missing spdxVersion.");
  }

  return {
    format: normalizedFormat,
    packageCount,
  };
}
