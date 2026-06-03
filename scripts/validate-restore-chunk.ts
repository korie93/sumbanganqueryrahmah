#!/usr/bin/env tsx
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_RESTORE_CHUNK_SIZE,
  MAX_RESTORE_CHUNK_SIZE,
  MIN_RESTORE_CHUNK_SIZE,
} from "../server/repositories/backups-restore-config";

const MAX_RESTORE_CHUNKS = 10_000;
const LARGE_BACKUP_WARNING_BYTES = 128 * 1024 * 1024;

export interface RestoreChunkCliArgs {
  readonly backupPath: string;
  readonly chunkSize: number;
}

export interface RestoreArraySummary {
  readonly path: string;
  readonly items: number;
  readonly chunks: number;
}

export interface RestoreChunkValidationSummary {
  readonly arrays: RestoreArraySummary[];
  readonly backupFileSizeBytes: number;
  readonly chunkSize: number;
  readonly largestArrayItems: number;
  readonly estimatedAverageItemBytes: number;
  readonly estimatedPeakChunkBytes: number;
  readonly totalArrayItems: number;
  readonly totalChunks: number;
  readonly warnings: string[];
}

function readArgValue(args: readonly string[], name: string): string | null {
  const inlinePrefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) {
    return inline.slice(inlinePrefix.length);
  }

  const index = args.indexOf(`--${name}`);
  if (index >= 0) {
    return args[index + 1] ?? null;
  }

  return null;
}

export function parseStrictRestoreChunkSize(rawValue: string | null | undefined): number {
  if (rawValue === null || rawValue === undefined || rawValue.trim() === "") {
    return DEFAULT_RESTORE_CHUNK_SIZE;
  }

  const trimmed = rawValue.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`RESTORE_CHUNK_SIZE must be an integer between ${MIN_RESTORE_CHUNK_SIZE} and ${MAX_RESTORE_CHUNK_SIZE}.`);
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (
    !Number.isSafeInteger(parsed)
    || parsed < MIN_RESTORE_CHUNK_SIZE
    || parsed > MAX_RESTORE_CHUNK_SIZE
  ) {
    throw new Error(`RESTORE_CHUNK_SIZE must be between ${MIN_RESTORE_CHUNK_SIZE} and ${MAX_RESTORE_CHUNK_SIZE}.`);
  }

  return parsed;
}

export function parseRestoreChunkCliArgs(args: readonly string[]): RestoreChunkCliArgs {
  const backupPath = readArgValue(args, "backup");
  if (!backupPath) {
    throw new Error("Usage: tsx scripts/validate-restore-chunk.ts --backup <backup.json> [--chunk-size <records>]");
  }

  return {
    backupPath,
    chunkSize: parseStrictRestoreChunkSize(readArgValue(args, "chunk-size")),
  };
}

function collectArraySummaries(
  value: unknown,
  chunkSize: number,
  path: string,
  summaries: RestoreArraySummary[],
): void {
  if (Array.isArray(value)) {
    summaries.push({
      path,
      items: value.length,
      chunks: Math.ceil(value.length / chunkSize),
    });
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    collectArraySummaries(child, chunkSize, `${path}.${key}`, summaries);
  }
}

export function summarizeBackupRestoreChunks(
  backupData: unknown,
  params: {
    readonly backupFileSizeBytes: number;
    readonly chunkSize: number;
  },
): RestoreChunkValidationSummary {
  const arrays: RestoreArraySummary[] = [];
  collectArraySummaries(backupData, params.chunkSize, "$", arrays);

  const totalArrayItems = arrays.reduce((sum, item) => sum + item.items, 0);
  const totalChunks = arrays.reduce((sum, item) => sum + item.chunks, 0);
  const largestArrayItems = arrays.reduce((max, item) => Math.max(max, item.items), 0);
  const estimatedAverageItemBytes =
    totalArrayItems > 0 ? Math.ceil(params.backupFileSizeBytes / totalArrayItems) : 0;
  const estimatedPeakChunkBytes = estimatedAverageItemBytes * params.chunkSize;
  const warnings: string[] = [];

  if (params.backupFileSizeBytes > LARGE_BACKUP_WARNING_BYTES) {
    warnings.push("Backup is large; run this validation close to the restore host memory profile.");
  }

  return {
    arrays,
    backupFileSizeBytes: params.backupFileSizeBytes,
    chunkSize: params.chunkSize,
    largestArrayItems,
    estimatedAverageItemBytes,
    estimatedPeakChunkBytes,
    totalArrayItems,
    totalChunks,
    warnings,
  };
}

function printSummary(backupPath: string, summary: RestoreChunkValidationSummary): void {
  console.log("SQR restore chunk validation");
  console.log(`backup: ${basename(backupPath)}`);
  console.log(`backupFileSizeBytes: ${summary.backupFileSizeBytes}`);
  console.log(`chunkSizeRecords: ${summary.chunkSize}`);
  console.log(`arrayDatasets: ${summary.arrays.length}`);
  console.log(`totalArrayItems: ${summary.totalArrayItems}`);
  console.log(`totalChunks: ${summary.totalChunks}`);
  console.log(`largestArrayItems: ${summary.largestArrayItems}`);
  console.log(`estimatedPeakChunkBytes: ${summary.estimatedPeakChunkBytes}`);

  for (const warning of summary.warnings) {
    console.warn(`warning: ${warning}`);
  }
}

export async function validateRestoreChunkFromFile(args: RestoreChunkCliArgs): Promise<RestoreChunkValidationSummary> {
  const fileStat = await stat(args.backupPath);
  if (!fileStat.isFile()) {
    throw new Error("Backup path must point to a regular file.");
  }

  const raw = await readFile(args.backupPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Backup file must be valid JSON before RESTORE_CHUNK_SIZE can be validated.");
  }

  const summary = summarizeBackupRestoreChunks(parsed, {
    backupFileSizeBytes: fileStat.size,
    chunkSize: args.chunkSize,
  });

  if (summary.arrays.length === 0) {
    throw new Error("Backup JSON does not contain array datasets to validate.");
  }

  if (summary.totalChunks > MAX_RESTORE_CHUNKS) {
    throw new Error(
      `RESTORE_CHUNK_SIZE=${summary.chunkSize} creates too many restore chunks (${summary.totalChunks}; max ${MAX_RESTORE_CHUNKS}). Increase the chunk size or split the restore.`,
    );
  }

  return summary;
}

async function main(): Promise<void> {
  const args = parseRestoreChunkCliArgs(process.argv.slice(2));
  const summary = await validateRestoreChunkFromFile(args);
  printSummary(args.backupPath, summary);
  console.log("Chunk size valid for this backup.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Restore chunk validation failed.";
    console.error(message);
    process.exitCode = 1;
  });
}
