import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrationRollbackManifest } from "./db-migration-rollback.manifest.mjs";
import {
  discoverDrizzleMigrationTags,
  formatMigrationRollbackReport,
  readDrizzleJournalTags,
  validateMigrationRollbackGovernance,
} from "./lib/db-migration-rollback-governance.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const drizzleDir = path.join(repoRoot, "drizzle");

const migrationTags = discoverDrizzleMigrationTags({ drizzleDir });
const journalTags = readDrizzleJournalTags({
  journalPath: path.join(drizzleDir, "meta", "_journal.json"),
});

const validation = validateMigrationRollbackGovernance({
  downSqlDir: path.join(drizzleDir, "rollback"),
  journalTags,
  manifest: migrationRollbackManifest,
  migrationTags,
});
const report = formatMigrationRollbackReport(validation);

if (validation.failures.length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
