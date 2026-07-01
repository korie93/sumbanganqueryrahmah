import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const DEFAULT_DISCOVERY_ROOTS = ["shared", "server", "scripts", "drizzle"];
const FOREIGN_KEY_DISCOVERY_ROOTS = ["shared", "server", "drizzle"];

const TABLE_PATTERNS = [
  /CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?["']?([a-zA-Z0-9_]+)["']?/gi,
  /ALTER TABLE(?: IF EXISTS)?\s+(?:public\.)?([a-zA-Z0-9_]+)/gi,
  /pgTable\("([a-zA-Z0-9_]+)"/g,
];
const EXPLICIT_ON_DELETE_PATTERN = /\bon\s+delete\s+(?:cascade|restrict|set\s+null|set\s+default|no\s+action)\b/i;
const SQL_REFERENCES_PATTERN = /\breferences\b/i;
const SQL_DDL_CONTEXT_PATTERN = /\b(?:create\s+table|alter\s+table|add\s+constraint|foreign\s+key)\b/i;
const DRIZZLE_REFERENCES_PATTERN = /\.references\s*\(/g;

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

function lineNumberForIndex(sourceText, index) {
  return sourceText.slice(0, index).split(/\r?\n/).length;
}

function collectSourceFiles({ cwd, roots }) {
  const files = [];

  for (const root of roots) {
    const absoluteRoot = path.resolve(cwd, root);
    try {
      walkFiles(absoluteRoot, files);
    } catch {
      // Missing roots are fine for reuse in isolated tests.
    }
  }

  return files;
}

function extractBalancedCall(sourceText, startIndex) {
  const openParenIndex = sourceText.indexOf("(", startIndex);
  if (openParenIndex < 0) {
    return sourceText.slice(startIndex, startIndex + 120);
  }

  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = openParenIndex; index < sourceText.length; index += 1) {
    const char = sourceText[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return sourceText.slice(startIndex, index + 1);
      }
    }
  }

  return sourceText.slice(startIndex, startIndex + 240);
}

function findDrizzleForeignKeyDeleteActionViolations({ relativePath, sourceText }) {
  const violations = [];
  let match;

  while ((match = DRIZZLE_REFERENCES_PATTERN.exec(sourceText))) {
    const clause = extractBalancedCall(sourceText, match.index);
    if (!/\bonDelete\s*:/.test(clause)) {
      violations.push({
        file: relativePath,
        line: lineNumberForIndex(sourceText, match.index),
        sourceType: "drizzle-schema",
        message: "Drizzle .references() must declare an explicit onDelete action.",
        snippet: clause.replace(/\s+/g, " ").trim().slice(0, 180),
      });
    }
  }

  DRIZZLE_REFERENCES_PATTERN.lastIndex = 0;
  return violations;
}

function collectSqlReferenceClause(lines, lineIndex) {
  const clauseLines = [lines[lineIndex]];
  const maxLookaheadLines = 8;
  const maxLineIndex = Math.min(lines.length - 1, lineIndex + maxLookaheadLines);

  for (let index = lineIndex + 1; index <= maxLineIndex; index += 1) {
    const line = lines[index];
    if (SQL_REFERENCES_PATTERN.test(line)) {
      break;
    }
    clauseLines.push(line);
    if (/;\s*(?:--.*)?$/.test(line)) {
      break;
    }
  }

  return clauseLines.join("\n");
}

function hasSqlDdlContext(lines, lineIndex, clause) {
  if (SQL_DDL_CONTEXT_PATTERN.test(clause)) {
    return true;
  }

  const lookbehindLineCount = 8;
  const startLineIndex = Math.max(0, lineIndex - lookbehindLineCount);
  const context = lines.slice(startLineIndex, lineIndex + 1).join("\n");
  return SQL_DDL_CONTEXT_PATTERN.test(context);
}

function findSqlForeignKeyDeleteActionViolations({ relativePath, sourceText }) {
  const violations = [];
  const lines = sourceText.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!SQL_REFERENCES_PATTERN.test(line) || /\.references\s*\(/.test(line)) {
      continue;
    }

    const clause = collectSqlReferenceClause(lines, index);
    if (!hasSqlDdlContext(lines, index, clause)) {
      continue;
    }

    if (!EXPLICIT_ON_DELETE_PATTERN.test(clause)) {
      violations.push({
        file: relativePath,
        line: index + 1,
        sourceType: "sql-ddl",
        message: "SQL foreign key reference must declare an explicit ON DELETE action.",
        snippet: clause.replace(/\s+/g, " ").trim().slice(0, 180),
      });
    }
  }

  return violations;
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
  const files = collectSourceFiles({ cwd, roots });

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

export function discoverForeignKeyDeleteActionViolations({
  cwd = process.cwd(),
  roots = FOREIGN_KEY_DISCOVERY_ROOTS,
} = {}) {
  const violations = [];

  for (const filePath of collectSourceFiles({ cwd, roots })) {
    const relativePath = normalizePath(path.relative(cwd, filePath));
    if (isTestFile(relativePath)) {
      continue;
    }

    const sourceText = readFileSync(filePath, "utf8");
    violations.push(
      ...findDrizzleForeignKeyDeleteActionViolations({ relativePath, sourceText }),
      ...findSqlForeignKeyDeleteActionViolations({ relativePath, sourceText }),
    );
  }

  return violations.sort((left, right) => (
    left.file.localeCompare(right.file) || left.line - right.line
  ));
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

  if (entry.mode === "hybrid-managed") {
    if (typeof entry.migrationRoadmap !== "string" || entry.migrationRoadmap.trim().length < 48) {
      failures.push(`Manifest entry "${table}" is hybrid-managed but does not include a migrationRoadmap.`);
    } else if (!/drizzle-reviewed/i.test(entry.migrationRoadmap)) {
      failures.push(`Manifest entry "${table}" hybrid migrationRoadmap must name drizzle-reviewed as the target mode.`);
    }
  }
}

function validateModeRequirements(table, entry, failures) {
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

  const manifestTables = manifest.tables ?? {};
  const hybridRoadmaps = Object.entries(manifestTables)
    .filter(([, entry]) => entry.mode === "hybrid-managed")
    .sort(([left], [right]) => left.localeCompare(right));
  if (hybridRoadmaps.length > 0) {
    lines.push("Hybrid-managed migration roadmap:");
    for (const [table, entry] of hybridRoadmaps) {
      lines.push(`- ${table}: ${entry.migrationRoadmap}`);
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

  const uncoveredTables = [...discoveredTables.keys()].filter((table) => !manifestTables[table]);
  if (uncoveredTables.length > 0) {
    lines.push(`Uncovered tables: ${uncoveredTables.join(", ")}`);
  }

  return lines.join("\n");
}

export function formatForeignKeyDeleteActionReport(violations) {
  if (violations.length === 0) {
    return "All discovered foreign keys declare explicit delete actions.";
  }

  return [
    "Foreign key delete-action governance failed:",
    ...violations.map((violation) => (
      `- ${violation.file}:${violation.line} [${violation.sourceType}] ${violation.message} ${violation.snippet}`
    )),
  ].join("\n");
}
