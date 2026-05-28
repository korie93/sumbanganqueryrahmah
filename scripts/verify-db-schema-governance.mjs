import path from "node:path";
import { fileURLToPath } from "node:url";
import { schemaGovernanceManifest } from "./db-schema-governance.manifest.mjs";
import {
  discoverForeignKeyDeleteActionViolations,
  discoverSchemaTables,
  formatForeignKeyDeleteActionReport,
  formatSchemaGovernanceReport,
  validateSchemaGovernance,
} from "./lib/db-schema-governance.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const discoveredTables = discoverSchemaTables({ cwd: repoRoot });
const foreignKeyDeleteActionViolations = discoverForeignKeyDeleteActionViolations({ cwd: repoRoot });
const validation = validateSchemaGovernance({
  discoveredTables,
  manifest: schemaGovernanceManifest,
});

const report = formatSchemaGovernanceReport({
  discoveredTables,
  manifest: schemaGovernanceManifest,
  validation,
});
const foreignKeyDeleteActionReport = formatForeignKeyDeleteActionReport(foreignKeyDeleteActionViolations);

if (validation.failures.length > 0 || foreignKeyDeleteActionViolations.length > 0) {
  console.error(`${report}\n${foreignKeyDeleteActionReport}`);
  process.exit(1);
}

console.log(`${report}\n${foreignKeyDeleteActionReport}`);

