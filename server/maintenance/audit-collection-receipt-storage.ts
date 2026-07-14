import process from "node:process";
import type { SQL } from "drizzle-orm";
import type {
  CollectionReceiptStorageAuditQueryResult,
  CollectionReceiptStorageAuditReport,
  ExecuteCollectionReceiptStorageAuditQuery,
} from "../repositories/collection-receipt-storage-audit-utils";

type CliOptions = {
  json: boolean;
  strict: boolean;
  staleDays: number;
};

const DEPLOYMENT_ONLY_ENVIRONMENT_KEYS = [
  "SQR_EXPECTED_RELEASE_SHA",
  "SQR_PUBLIC_BASE_URL",
  "SQR_RELEASE_ENV_FILE",
  "SQR_RELEASE_ROOT",
  "SQR_RELEASE_RUNTIME_DIR",
] as const;

function printUsage(): void {
  console.log([
    "Collection receipt storage audit (read-only)",
    "",
    "Usage:",
    "  node dist-local/scripts/audit-collection-receipt-storage.js [options]",
    "",
    "Options:",
    "  --json                Print a machine-readable count-only report.",
    "  --strict              Exit with code 2 when review is required.",
    "  --stale-days <days>   Classify unreferenced files older than this age (default: 30).",
    "  --help                Show this help.",
    "",
    "This command never changes database rows or filesystem entries.",
  ].join("\n"));
}

function parsePositiveInteger(raw: string | undefined, optionName: string): number {
  if (!raw || !/^\d{1,4}$/.test(raw)) {
    throw new Error(`${optionName} requires a whole number between 1 and 3650.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 3650) {
    throw new Error(`${optionName} requires a whole number between 1 and 3650.`);
  }
  return value;
}

function parseCliOptions(args: string[]): CliOptions | null {
  let json = false;
  let strict = false;
  let staleDays = 30;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") return null;
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (arg === "--stale-days") {
      staleDays = parsePositiveInteger(args[index + 1], arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return { json, strict, staleDays };
}

function sanitizeMaintenanceEnvironment(): void {
  for (const key of DEPLOYMENT_ONLY_ENVIRONMENT_KEYS) {
    delete process.env[key];
  }
}

function printHumanReport(report: CollectionReceiptStorageAuditReport): void {
  console.log("Collection receipt storage audit");
  console.log("Mode: READ ONLY (0 writes)");
  console.log(`Status: ${report.status}`);
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Unreferenced age threshold: ${report.staleAfterDays} days`);
  console.log("\nDatabase references:");
  console.log(`  Active relation rows: ${report.database.activeRelationRows}`);
  console.log(`  Archived relation rows: ${report.database.archivedRelationRows}`);
  console.log(`  Legacy cache rows: ${report.database.cacheRows}`);
  console.log(`  Unique referenced files: ${report.database.uniqueReferencedPaths}`);
  console.log(`  Invalid reference rows: ${report.database.invalidReferenceRows}`);
  console.log(`  Multiply referenced paths: ${report.database.multiplyReferencedPaths}`);
  console.log(`  Cache-only paths: ${report.database.cacheOnlyPaths}`);
  console.log("\nFilesystem inventory:");
  console.log(`  Storage directory present: ${report.filesystem.directoryPresent ? "yes" : "no"}`);
  console.log(`  Regular receipt files: ${report.filesystem.regularFiles}`);
  console.log(`  Regular receipt bytes: ${report.filesystem.regularFileBytes}`);
  console.log(`  Temporary upload files: ${report.filesystem.temporaryUploadFiles}`);
  console.log(`  Stale temporary uploads: ${report.filesystem.staleTemporaryUploadFiles}`);
  console.log(`  Symbolic links rejected: ${report.filesystem.symbolicLinks}`);
  console.log(`  Special entries rejected: ${report.filesystem.specialEntries}`);
  console.log(`  Unsupported extensions: ${report.filesystem.unsupportedExtensionFiles}`);
  console.log(`  Invalid file sizes: ${report.filesystem.invalidSizeFiles}`);
  console.log(`  Inspection errors: ${report.filesystem.inspectionErrors}`);
  console.log("\nReconciliation:");
  console.log(`  Referenced and present: ${report.reconciliation.referencedAndPresent}`);
  console.log(`  Referenced but missing: ${report.reconciliation.referencedButMissing}`);
  console.log(`  Active references missing: ${report.reconciliation.activeReferencesMissing}`);
  console.log(`  Archived references missing: ${report.reconciliation.archivedReferencesMissing}`);
  console.log(`  Cache references missing: ${report.reconciliation.cacheReferencesMissing}`);
  console.log(`  Unreferenced physical files: ${report.reconciliation.unreferencedFiles}`);
  console.log(`  Unreferenced physical bytes: ${report.reconciliation.unreferencedFileBytes}`);
  console.log(`  Stale unreferenced files: ${report.reconciliation.staleUnreferencedFiles}`);
  console.log(`  Stale unreferenced bytes: ${report.reconciliation.staleUnreferencedFileBytes}`);
  console.log("\nNo filenames, paths, database rows, or files were changed.");
}

async function main(): Promise<void> {
  let exitCode = 0;
  let database: typeof import("../db-postgres") | null = null;
  try {
    const options = parseCliOptions(process.argv.slice(2));
    if (!options) {
      printUsage();
      return;
    }
    sanitizeMaintenanceEnvironment();
    const [databaseModule, auditModule] = await Promise.all([
      import("../db-postgres"),
      import("../repositories/collection-receipt-storage-audit-utils"),
    ]);
    database = databaseModule;
    const execute: ExecuteCollectionReceiptStorageAuditQuery = async (query: SQL) => {
      const result = await databaseModule.db.execute(query);
      return { rows: result.rows ?? [] } satisfies CollectionReceiptStorageAuditQueryResult;
    };
    const report = await auditModule.auditCollectionReceiptStorage({
      execute,
      staleAfterMs: options.staleDays * 24 * 60 * 60 * 1000,
    });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report);
    }
    if (options.strict && report.status !== "clean") exitCode = 2;
  } catch {
    exitCode = 1;
    console.error("Collection receipt storage audit failed without changing data.");
  } finally {
    database?.stopPgPoolBackgroundTasks();
    await database?.closePostgresPools().catch(() => undefined);
  }
  process.exitCode = exitCode;
}

void main();
