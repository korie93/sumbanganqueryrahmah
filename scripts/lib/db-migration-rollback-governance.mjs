import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATION_FILE_PATTERN = /^\d{4}_.+\.sql$/;
const SUPPORTED_ROLLBACK_STRATEGIES = new Set(["backup-restore", "reversible-down"]);

function uniqueValues(values) {
  return [...new Set(values)];
}

function hasNonEmptyStringArray(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

export function discoverDrizzleMigrationTags({ drizzleDir }) {
  return readdirSync(drizzleDir)
    .filter((fileName) => MIGRATION_FILE_PATTERN.test(fileName))
    .map((fileName) => fileName.replace(/\.sql$/, ""))
    .sort();
}

export function readDrizzleJournalTags({ journalPath }) {
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (!Array.isArray(journal.entries)) {
    throw new Error("Drizzle journal is missing an entries array.");
  }

  return journal.entries
    .map((entry) => String(entry?.tag || "").trim())
    .filter(Boolean)
    .sort();
}

function validateManifestEntry(entry, index, { downSqlDir }) {
  const failures = [];
  const label = `rollback manifest entry ${index}`;

  if (!entry || typeof entry !== "object") {
    return [`${label} must be an object.`];
  }

  if (typeof entry.migration !== "string" || !entry.migration.trim()) {
    failures.push(`${label} must name a migration.`);
  }

  if (!SUPPORTED_ROLLBACK_STRATEGIES.has(entry.strategy)) {
    failures.push(`${entry.migration || label} has an unsupported rollback strategy.`);
  }

  if (!hasNonEmptyStringArray(entry.preconditions)) {
    failures.push(`${entry.migration || label} must define rollback preconditions.`);
  }

  if (!hasNonEmptyStringArray(entry.rollbackSteps)) {
    failures.push(`${entry.migration || label} must define rollback steps.`);
  }

  if (!hasNonEmptyStringArray(entry.validationSteps)) {
    failures.push(`${entry.migration || label} must define rollback validation steps.`);
  }

  if (entry.strategy === "backup-restore" && entry.backupRequired !== true) {
    failures.push(`${entry.migration || label} uses backup-restore but does not require a backup.`);
  }

  if (entry.strategy === "reversible-down") {
    if (entry.backupRequired !== true) {
      failures.push(`${entry.migration || label} reversible-down rollbacks still require a verified backup.`);
    }

    if (typeof entry.downSqlPath !== "string" || !entry.downSqlPath.trim()) {
      failures.push(`${entry.migration || label} reversible-down rollback must define downSqlPath.`);
    } else {
      const resolvedDownSqlPath = path.resolve(downSqlDir, entry.downSqlPath);
      if (!resolvedDownSqlPath.startsWith(path.resolve(downSqlDir) + path.sep)) {
        failures.push(`${entry.migration || label} downSqlPath must stay inside the rollback SQL directory.`);
      } else if (!existsSync(resolvedDownSqlPath)) {
        failures.push(`${entry.migration || label} downSqlPath does not exist: ${entry.downSqlPath}`);
      }
    }
  }

  return failures;
}

export function validateMigrationRollbackGovernance({
  downSqlDir,
  journalTags,
  manifest,
  migrationTags,
}) {
  const failures = [];
  const manifestMigrations = manifest.map((entry) => entry?.migration).filter(Boolean);
  const duplicateManifestEntries = uniqueValues(
    manifestMigrations.filter((migration, index) => manifestMigrations.indexOf(migration) !== index),
  );

  for (const duplicate of duplicateManifestEntries) {
    failures.push(`Duplicate rollback manifest entry for ${duplicate}.`);
  }

  for (const migration of migrationTags) {
    if (!manifestMigrations.includes(migration)) {
      failures.push(`Missing rollback manifest entry for ${migration}.`);
    }
  }

  for (const migration of manifestMigrations) {
    if (!migrationTags.includes(migration)) {
      failures.push(`Rollback manifest references unknown migration ${migration}.`);
    }
  }

  for (const migration of migrationTags) {
    if (!journalTags.includes(migration)) {
      failures.push(`Drizzle journal is missing migration ${migration}.`);
    }
  }

  for (const migration of journalTags) {
    if (!migrationTags.includes(migration)) {
      failures.push(`Drizzle journal references missing SQL migration ${migration}.`);
    }
  }

  manifest.forEach((entry, index) => {
    failures.push(...validateManifestEntry(entry, index, { downSqlDir }));
  });

  return {
    coveredMigrations: migrationTags.length - migrationTags
      .filter((migration) => !manifestMigrations.includes(migration))
      .length,
    failures,
    migrationCount: migrationTags.length,
  };
}

export function formatMigrationRollbackReport(validation) {
  if (validation.failures.length > 0) {
    return [
      "Database migration rollback governance failed:",
      ...validation.failures.map((failure) => `- ${failure}`),
    ].join("\n");
  }

  return [
    "Database migration rollback governance passed.",
    `Rollback manifest coverage: ${validation.coveredMigrations}/${validation.migrationCount} migrations.`,
  ].join("\n");
}
