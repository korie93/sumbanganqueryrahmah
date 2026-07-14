import process from "node:process";
import { sql, type SQL } from "drizzle-orm";
import { BackupsRepository } from "../repositories/backups.repository";
import { createBackupPayloadChunkReader } from "../repositories/backups-payload-reader-utils";
import {
  acquireCollectionReceiptRecoveryLock,
  recoverCollectionReceiptMetadataInDatabase,
  type CollectionReceiptRecoveryQueryResult,
  type ExecuteCollectionReceiptRecoveryQuery,
} from "../repositories/collection-receipt-recovery-db-utils";
import {
  collectCollectionReceiptRecoveryCandidates,
  inspectCollectionReceiptRecoveryFile,
  type CollectionReceiptRecoveryFileRejectionReason,
  type InspectedCollectionReceiptRecoveryCandidate,
} from "../repositories/collection-receipt-recovery-utils";
import { parseBackupMetadataSafe } from "../internal/backupMetadata";
import {
  closePostgresPools,
  db,
  stopPgPoolBackgroundTasks,
} from "../db-postgres";
import {
  verifyBackupIntegrityFromChunks,
} from "../services/backup-operations-integrity-utils";
import { DEFAULT_BACKUP_MAX_PAYLOAD_BYTES } from "../services/backup-operations-service-shared";

type CliOptions =
  | { mode: "help" }
  | { mode: "list" }
  | {
      mode: "recover";
      backupId: string;
      apply: boolean;
      confirmBackupId: string | null;
      allowUnverifiedBackup: boolean;
    };

const FILE_REJECTION_REASONS: CollectionReceiptRecoveryFileRejectionReason[] = [
  "file-missing",
  "file-not-regular",
  "file-size-invalid",
  "file-read-failed",
  "file-type-unsupported",
  "file-extension-mismatch",
  "file-security-invalid",
  "file-hash-mismatch",
];

function printUsage(): void {
  console.log([
    "Collection receipt metadata recovery",
    "",
    "List backups and current receipt metadata:",
    "  node dist-local/scripts/recover-collection-receipt-metadata.js --list",
    "",
    "Run a safe dry-run against one pre-incident backup:",
    "  node dist-local/scripts/recover-collection-receipt-metadata.js --backup-id <id>",
    "",
    "Apply only after reviewing the dry-run:",
    "  node dist-local/scripts/recover-collection-receipt-metadata.js \\",
    "    --backup-id <id> --apply --confirm-backup-id <id>",
    "",
    "Legacy backups without a stored checksum are rejected unless the explicit",
    "--allow-unverified-backup flag is supplied.",
  ].join("\n"));
}

function readOptionValue(args: string[], index: number, optionName: string): string {
  const value = String(args[index + 1] ?? "").trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.charCodeAt(0);
  return codePoint <= 31 || codePoint === 127;
}

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some(isControlCharacter);
}

function parseCliOptions(args: string[]): CliOptions {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { mode: "help" };
  }
  let list = false;
  let backupId: string | null = null;
  let apply = false;
  let confirmBackupId: string | null = null;
  let allowUnverifiedBackup = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--list") {
      list = true;
      continue;
    }
    if (arg === "--backup-id") {
      backupId = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--confirm-backup-id") {
      confirmBackupId = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--allow-unverified-backup") {
      allowUnverifiedBackup = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (list) {
    if (backupId || apply || confirmBackupId || allowUnverifiedBackup) {
      throw new Error("--list cannot be combined with recovery options.");
    }
    return { mode: "list" };
  }
  if (!backupId || backupId.length > 200 || containsControlCharacters(backupId)) {
    throw new Error("A valid --backup-id is required.");
  }
  if (apply && confirmBackupId !== backupId) {
    throw new Error("Apply rejected: --confirm-backup-id must exactly match --backup-id.");
  }
  if (!apply && confirmBackupId) {
    throw new Error("--confirm-backup-id is only valid with --apply.");
  }

  return {
    mode: "recover",
    backupId,
    apply,
    confirmBackupId,
    allowUnverifiedBackup,
  };
}

function createBackupsRepository(): BackupsRepository {
  return new BackupsRepository({
    ensureBackupsTable: async () => undefined,
    parseBackupMetadataSafe,
  });
}

function createExecute(
  executor: { execute: (query: SQL) => PromiseLike<{ rows?: readonly unknown[] }> },
): ExecuteCollectionReceiptRecoveryQuery {
  return async (query) => {
    const result = await executor.execute(query);
    return { rows: result.rows ?? [] } satisfies CollectionReceiptRecoveryQueryResult;
  };
}

function readMetadataReceiptCount(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).collectionRecordReceiptsCount;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}

function sanitizeConsoleText(value: unknown, maxLength = 80): string {
  return Array.from(String(value ?? ""))
    .map((character) => isControlCharacter(character) ? " " : character)
    .join("")
    .trim()
    .slice(0, maxLength);
}

async function listRecoveryState(): Promise<void> {
  const currentResult = await db.execute(sql`
    SELECT
      (SELECT count(*)::integer FROM public.collection_record_receipts) AS "allReceiptRelations",
      (
        SELECT count(*)::integer
        FROM public.collection_record_receipts
        WHERE deleted_at IS NULL
      ) AS "activeReceiptRelations",
      (
        SELECT count(*)::integer
        FROM public.collection_records
        WHERE receipt_file IS NOT NULL AND btrim(receipt_file) <> ''
      ) AS "recordsWithReceiptCache"
  `);
  const current = (currentResult.rows[0] ?? {}) as Record<string, unknown>;
  console.log("Current database receipt metadata:");
  console.log(`  Active relations: ${Number(current.activeReceiptRelations ?? 0)}`);
  console.log(`  All relations: ${Number(current.allReceiptRelations ?? 0)}`);
  console.log(`  Records with receipt cache: ${Number(current.recordsWithReceiptCache ?? 0)}`);

  const repository = createBackupsRepository();
  const page = await repository.listBackupsPage({ page: 1, pageSize: 25, sortBy: "newest" });
  console.log("\nNewest backups (choose one created before the immutable cutover):");
  if (page.backups.length === 0) {
    console.log("  No backups found.");
    return;
  }
  for (const backup of page.backups) {
    const createdAt = backup.createdAt instanceof Date
      ? backup.createdAt.toISOString()
      : sanitizeConsoleText(backup.createdAt, 40);
    const receiptCount = readMetadataReceiptCount(backup.metadata);
    console.log(
      `  ${sanitizeConsoleText(backup.id, 200)} | ${createdAt} | receipts=${receiptCount ?? "unknown"} | ${sanitizeConsoleText(backup.name)}`,
    );
  }
}

async function inspectRecoveryFiles(
  candidates: Awaited<ReturnType<typeof collectCollectionReceiptRecoveryCandidates>>["candidates"],
) {
  const accepted: InspectedCollectionReceiptRecoveryCandidate[] = [];
  const rejected = Object.fromEntries(FILE_REJECTION_REASONS.map((reason) => [reason, 0])) as Record<
    CollectionReceiptRecoveryFileRejectionReason,
    number
  >;

  for (const candidate of candidates) {
    const inspection = await inspectCollectionReceiptRecoveryFile(candidate);
    if (inspection.ok) {
      accepted.push(inspection.candidate);
    } else {
      rejected[inspection.reason] += 1;
    }
  }

  return { accepted, rejected };
}

async function runRecovery(options: Extract<CliOptions, { mode: "recover" }>): Promise<void> {
  const repository = createBackupsRepository();
  const backup = await repository.getBackupMetadataById(options.backupId);
  if (!backup) {
    throw new Error("Backup not found.");
  }

  const integrityChunks = await repository.iterateBackupDataJsonChunksById(options.backupId);
  if (!integrityChunks) {
    throw new Error("Backup payload is not readable.");
  }
  const integrity = await verifyBackupIntegrityFromChunks(backup, integrityChunks);
  if (integrity.payloadBytes > DEFAULT_BACKUP_MAX_PAYLOAD_BYTES) {
    throw new Error("Backup payload exceeds the configured 64 MB recovery limit.");
  }
  if (!integrity.ok) {
    throw new Error("Backup checksum mismatch. Recovery cancelled.");
  }
  if (!integrity.verified && !options.allowUnverifiedBackup) {
    throw new Error(
      "Backup has no stored checksum. Recovery cancelled; review it before using --allow-unverified-backup.",
    );
  }

  const payloadChunks = await repository.iterateBackupDataJsonChunksById(options.backupId);
  if (!payloadChunks) {
    throw new Error("Backup payload is not readable on the second verification pass.");
  }
  const collected = await collectCollectionReceiptRecoveryCandidates(
    createBackupPayloadChunkReader(payloadChunks),
  );
  const fileInspection = await inspectRecoveryFiles(collected.candidates);

  let databaseStats;
  if (options.apply) {
    databaseStats = await db.transaction(async (transaction) => {
      const execute = createExecute(transaction);
      await acquireCollectionReceiptRecoveryLock(execute);
      return recoverCollectionReceiptMetadataInDatabase({
        execute,
        candidates: fileInspection.accepted,
        backupId: options.backupId,
        apply: true,
      });
    });
  } else {
    databaseStats = await recoverCollectionReceiptMetadataInDatabase({
      execute: createExecute(db),
      candidates: fileInspection.accepted,
      backupId: options.backupId,
      apply: false,
    });
  }

  console.log(`Backup: ${sanitizeConsoleText(backup.name)} (${sanitizeConsoleText(backup.id, 200)})`);
  console.log(`Integrity: ${integrity.verified ? "verified" : "unverified legacy backup"}`);
  console.log(`Payload bytes: ${integrity.payloadBytes}`);
  console.log(`Backup collection records scanned: ${collected.stats.backupCollectionRecords}`);
  console.log(`Backup receipt relations scanned: ${collected.stats.backupReceiptRelations}`);
  console.log(`Legacy receipt paths scanned: ${collected.stats.legacyReceiptPaths}`);
  console.log(`Unique candidates: ${collected.candidates.length}`);
  console.log(`Readable and validated files: ${fileInspection.accepted.length}`);
  for (const reason of FILE_REJECTION_REASONS) {
    if (fileInspection.rejected[reason] > 0) {
      console.log(`Rejected ${reason}: ${fileInspection.rejected[reason]}`);
    }
  }
  console.log(`Missing collection records: ${databaseStats.missingCollectionRecords}`);
  console.log(`Already active: ${databaseStats.alreadyActive}`);
  console.log(`Already archived (preserved): ${databaseStats.alreadyArchived}`);
  console.log(`Recoverable relations: ${databaseStats.recoverable}`);
  if (options.apply) {
    console.log(`Inserted relations: ${databaseStats.inserted}`);
    console.log(`Concurrent/unique conflicts skipped: ${databaseStats.conflictSkipped}`);
    console.log(`Record caches refreshed: ${databaseStats.recordsRefreshed}`);
    console.log("Recovery apply completed.");
  } else {
    console.log("Dry-run only. No database rows were changed.");
    console.log(
      `Apply with: --backup-id ${options.backupId} --apply --confirm-backup-id ${options.backupId}`,
    );
  }
}

async function main(): Promise<void> {
  let exitCode = 0;
  try {
    const options = parseCliOptions(process.argv.slice(2));
    if (options.mode === "help") {
      printUsage();
    } else if (options.mode === "list") {
      await listRecoveryState();
    } else {
      await runRecovery(options);
    }
  } catch (error) {
    exitCode = 1;
    console.error(error instanceof Error ? error.message : "Receipt metadata recovery failed.");
  } finally {
    stopPgPoolBackgroundTasks();
    await closePostgresPools().catch(() => undefined);
  }
  process.exitCode = exitCode;
}

void main();
