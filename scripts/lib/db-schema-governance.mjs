import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const DEFAULT_DISCOVERY_ROOTS = ["shared", "server", "scripts", "drizzle"];

const TABLE_PATTERNS = [
  /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?["']?([a-zA-Z0-9_]+)["']?/gi,
  /ALTER TABLE(?: IF EXISTS)?\s+(?:public\.)?([a-zA-Z0-9_]+)/gi,
  /pgTable\("([a-zA-Z0-9_]+)"/g,
];

export function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function walkFiles(rootPath, results) {
  const stat = statSync(rootPath);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(rootPath)) {
      walkFiles(path.join(rootPath, entry), results);
    }
    return;
  }

  if (!/\.(ts|mjs|sql)$/.test(rootPath)) {
    return;
  }

  results.push(rootPath);
}

function isTestFile(relativePath) {
  const normalized = normalizePath(relativePath);
  return normalized.includes("/tests/") || normalized.includes(".test.");
}

export function extractTableNames(sourceText) {
  const tables = new Set();

  for (const pattern of TABLE_PATTERNS) {
    let match;
    while ((match = pattern.exec(sourceText))) {
      tables.add(match[1]);
    }
    pattern.lastIndex = 0;
  }

  return [...tables].sort();
}

export function classifySourceType(relativePath) {
  const normalized = normalizePath(relativePath);

  if (/^shared\/schema-postgres(?:-[a-z0-9-]+)?\.ts$/i.test(normalized)) {
    return "drizzle-schema";
  }

  if (normalized.startsWith("drizzle/") && normalized.endsWith(".sql")) {
    return "drizzle-migration";
  }

  if (normalized.startsWith("server/sql/")) {
    return "legacy-sql";
  }

  if (normalized.startsWith("scripts/")) {
    return "maintenance-script";
  }

  if (normalized.startsWith("server/")) {
    return "runtime-ddl";
  }

  return "unknown";
}

export function discoverSchemaTables({ cwd = process.cwd(), roots = DEFAULT_DISCOVERY_ROOTS } = {}) {
  const files = [];

  for (const root of roots) {
    const absoluteRoot = path.resolve(cwd, root);
    try {
      walkFiles(absoluteRoot, files);
    } catch {
      // Missing roots are fine for reuse in isolated tests.
    }
  }

  const discovered = new Map();

  for (const filePath of files) {
    const relativePath = normalizePath(path.relative(cwd, filePath));
    if (isTestFile(relativePath)) {
      continue;
    }

    const sourceType = classifySourceType(relativePath);
    const tables = extractTableNames(readFileSync(filePath, "utf8"));

    if (tables.length === 0) {
      continue;
    }

    for (const table of tables) {
      const entry = discovered.get(table) ?? {
        table,
        sourceTypes: new Set(),
        sourceFiles: [],
      };

      entry.sourceTypes.add(sourceType);
      entry.sourceFiles.push(relativePath);
      discovered.set(table, entry);
    }
  }

  return new Map(
    [...discovered.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([table, entry]) => [
        table,
        {
          table,
          sourceTypes: [...entry.sourceTypes].sort(),
          sourceFiles: entry.sourceFiles.sort(),
        },
      ]),
  );
}

const GOVERNANCE_MODES = new Set([
  "drizzle-reviewed",
  "hybrid-managed",
  "runtime-managed",
  "runtime-transitional",
]);

const GOVERNANCE_AUTHORITIES = new Set([
  "drizzle-schema",
  "runtime-ddl",
]);

function validateManifestEntryMetadata(table, entry, failures) {
  if (!GOVERNANCE_MODES.has(entry.mode)) {
    failures.push(`Manifest entry "${table}" has unsupported governance mode "${entry.mode}".`);
  }

  if (!GOVERNANCE_AUTHORITIES.has(entry.authority)) {
    failures.push(`Manifest entry "${table}" has unsupported authority "${entry.authority}".`);
  }

  if (!Array.isArray(entry.allowedSources) || entry.allowedSources.length === 0) {
    failures.push(`Manifest entry "${table}" must declare at least one allowed schema source.`);
  }

  if (typeof entry.notes !== "string" || entry.notes.trim().length < 24) {
    failures.push(`Manifest entry "${table}" must include a specific governance note.`);
  }

  if (entry.mode === "drizzle-reviewed") {
    if (entry.authority !== "drizzle-schema") {
      failures.push(`Manifest entry "${table}" is drizzle-reviewed but does not use drizzle-schema as authority.`);
    }
    if (!entry.allowedSources?.includes("drizzle-schema")) {
      failures.push(`Manifest entry "${table}" is drizzle-reviewed but does not allow drizzle-schema.`);
    }
    if (!entry.allowedSources?.includes("drizzle-migration")) {
      failures.push(`Manifest entry "${table}" is drizzle-reviewed but does not allow drizzle-migration.`);
    }
  }

  if (entry.mode === "runtime-managed" || entry.mode === "runtime-transitional") {
    if (entry.authority !== "runtime-ddl") {
      failures.push(`Manifest entry "${table}" is ${entry.mode} but does not use runtime-ddl as authority.`);
    }
    const nonRuntimeSources = entry.allowedSources?.filter((sourceType) => sourceType !== "runtime-ddl") ?? [];
    if (nonRuntimeSources.length > 0) {
      failures.push(
        `Manifest entry "${table}" is ${entry.mode} but allows non-runtime sources: ${nonRuntimeSources.join(", ")}.`,
      );
    }
  }
}

function validateModeRequirements(table, entry, failures) {
  if (entry.sourceTypes.includes("legacy-sql")) {
    if (entry.mode !== "drizzle-reviewed") {
      failures.push(`Table "${table}" still uses legacy-sql sources but is not marked drizzle-reviewed.`);
    }
    if (!entry.sourceTypes.includes("drizzle-schema")) {
      failures.push(`Table "${table}" still uses legacy-sql sources but is missing a Drizzle schema authority.`);
    }
    if (!entry.sourceTypes.includes("drizzle-migration")) {
      failures.push(`Table "${table}" still uses legacy-sql sources but is missing a reviewed Drizzle SQL migration companion.`);
    }
  }

  if (entry.mode === "drizzle-reviewed") {
    if (!entry.sourceTypes.includes("drizzle-schema")) {
      failures.push(`Table "${table}" is marked drizzle-reviewed but is missing a Drizzle schema entry.`);
    }
    if (!entry.sourceTypes.includes("drizzle-migration")) {
      failures.push(`Table "${table}" is marked drizzle-reviewed but is missing a reviewed Drizzle SQL migration.`);
    }
  }
}

export function validateSchemaGovernance({ discoveredTables, manifest }) {
  const failures = [];
  const warnings = [];
  const manifestTables = manifest.tables ?? {};
  const modeCounts = {};

  for (const [table, entry] of Object.entries(manifestTables)) {
    validateManifestEntryMetadata(table, entry, failures);
  }

  for (const [table, entry] of discoveredTables.entries()) {
    const governance = manifestTables[table];
    if (!governance) {
      failures.push(`Table "${table}" is not declared in the DB schema governance manifest.`);
      continue;
    }

    modeCounts[governance.mode] = (modeCounts[governance.mode] ?? 0) + 1;

    const unexpectedSources = entry.sourceTypes.filter((sourceType) => !governance.allowedSources.includes(sourceType));
    if (unexpectedSources.length > 0) {
      failures.push(
        `Table "${table}" uses undeclared source types: ${unexpectedSources.join(", ")}. Declared: ${governance.allowedSources.join(", ")}.`,
      );
    }

    validateModeRequirements(table, {
      ...governance,
      sourceTypes: entry.sourceTypes,
    }, failures);

    if (
      governance.mode === "hybrid-managed"
      && !entry.sourceTypes.includes("drizzle-migration")
      && !entry.sourceTypes.includes("legacy-sql")
    ) {
      warnings.push(
        `Table "${table}" is still hybrid-managed without a reviewed SQL artifact; runtime bootstrap remains the compatibility authority.`,
      );
    }
  }

  for (const table of Object.keys(manifestTables).sort()) {
    if (!discoveredTables.has(table)) {
      failures.push(`Manifest entry "${table}" no longer matches any discovered table definition.`);
    }
  }

  return {
    failures,
    warnings,
    summary: {
      tableCount: discoveredTables.size,
      modeCounts,
    },
  };
}

export function formatSchemaGovernanceReport({ discoveredTables, manifest, validation }) {
  const lines = [];
  lines.push(`DB schema governance check inspected ${validation.summary.tableCount} table definitions.`);

  for (const [mode, count] of Object.entries(validation.summary.modeCounts).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`- ${mode}: ${count}`);
  }

  if (validation.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of validation.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (validation.failures.length > 0) {
    lines.push("Failures:");
    for (const failure of validation.failures) {
      lines.push(`- ${failure}`);
    }
  } else {
    lines.push("All discovered tables are classified in the governance manifest.");
  }

  const manifestTables = manifest.tables ?? {};
  const uncoveredTables = [...discoveredTables.keys()].filter((table) => !manifestTables[table]);
  if (uncoveredTables.length > 0) {
    lines.push(`Uncovered tables: ${uncoveredTables.join(", ")}`);
  }

  return lines.join("\n");
}
