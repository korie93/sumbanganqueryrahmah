import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runtimeConfig } from "../config/runtime";
import { COLLECTION_RECEIPT_DIR } from "../lib/collection-receipt-files";
import { logger } from "../lib/logger";

const IMPORT_UPLOAD_TEMP_DIR_PREFIX = "sqr-import-upload-";
const ORPHANED_UPLOAD_EXTENSION = ".upload";
const IMPORT_JOB_CANCEL_EXTENSION = ".cancel";
const IMPORT_JOB_DIRECTORY_NAME = "import-jobs";
const DEFAULT_ORPHANED_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_IMPORT_JOB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ORPHANED_UPLOAD_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_ORPHANED_UPLOAD_STARTUP_DELAY_MS = 30_000;

export type OrphanedUploadCleanupResult = {
  readonly scannedFiles: number;
  readonly removedFiles: number;
  readonly removedDirectories: number;
  readonly errors: number;
};

export type OrphanedUploadCleanupOptions = {
  readonly now?: number | undefined;
  readonly maxAgeMs?: number | undefined;
  readonly importJobMaxAgeMs?: number | undefined;
  readonly importTempRootDir?: string | undefined;
  readonly importJobDir?: string | undefined;
  readonly receiptUploadDir?: string | undefined;
};

export type OrphanedUploadCleanupJobOptions = OrphanedUploadCleanupOptions & {
  readonly intervalMs?: number | undefined;
  readonly startupDelayMs?: number | undefined;
  readonly cleanup?: (() => Promise<OrphanedUploadCleanupResult>) | undefined;
};

let orphanedUploadCleanupStop: (() => void) | null = null;

function emptyCleanupResult(): OrphanedUploadCleanupResult {
  return {
    scannedFiles: 0,
    removedFiles: 0,
    removedDirectories: 0,
    errors: 0,
  };
}

function addCleanupResults(
  left: OrphanedUploadCleanupResult,
  right: OrphanedUploadCleanupResult,
): OrphanedUploadCleanupResult {
  return {
    scannedFiles: left.scannedFiles + right.scannedFiles,
    removedFiles: left.removedFiles + right.removedFiles,
    removedDirectories: left.removedDirectories + right.removedDirectories,
    errors: left.errors + right.errors,
  };
}

async function pathExists(directoryPath: string) {
  try {
    await fs.access(directoryPath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupUploadFile(filePath: string, now: number, maxAgeMs: number) {
  const result = emptyCleanupResult();

  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile()) {
      return result;
    }

    const scannedFiles = 1;
    const ageMs = now - stat.mtimeMs;
    if (ageMs <= maxAgeMs) {
      return {
        ...result,
        scannedFiles,
      };
    }

    await fs.rm(filePath, { force: true });
    return {
      ...result,
      scannedFiles,
      removedFiles: 1,
    };
  } catch (error) {
    logger.warn("Failed to cleanup orphaned upload file", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      ...result,
      errors: 1,
    };
  }
}

async function cleanupReceiptUploadDirectory(params: {
  receiptUploadDir: string;
  now: number;
  maxAgeMs: number;
}) {
  if (!await pathExists(params.receiptUploadDir)) {
    return emptyCleanupResult();
  }

  let result = emptyCleanupResult();
  const entries = await fs.readdir(params.receiptUploadDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(ORPHANED_UPLOAD_EXTENSION)) {
      continue;
    }

    result = addCleanupResults(
      result,
      await cleanupUploadFile(
        path.join(params.receiptUploadDir, entry.name),
        params.now,
        params.maxAgeMs,
      ),
    );
  }

  return result;
}

async function cleanupImportJobDirectory(params: {
  importJobDir: string;
  now: number;
  maxAgeMs: number;
}) {
  if (!await pathExists(params.importJobDir)) {
    return emptyCleanupResult();
  }

  let result = emptyCleanupResult();
  const entries = await fs.readdir(params.importJobDir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      !entry.isFile()
      || (
        !entry.name.endsWith(ORPHANED_UPLOAD_EXTENSION)
        && !entry.name.endsWith(IMPORT_JOB_CANCEL_EXTENSION)
      )
    ) {
      continue;
    }

    result = addCleanupResults(
      result,
      await cleanupUploadFile(
        path.join(params.importJobDir, entry.name),
        params.now,
        params.maxAgeMs,
      ),
    );
  }

  return result;
}

async function cleanupImportUploadDirectory(params: {
  directoryPath: string;
  now: number;
  maxAgeMs: number;
}) {
  let result = emptyCleanupResult();

  try {
    const directoryStat = await fs.lstat(params.directoryPath);
    if (!directoryStat.isDirectory()) {
      return result;
    }

    const entries = await fs.readdir(params.directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(ORPHANED_UPLOAD_EXTENSION)) {
        continue;
      }

      result = addCleanupResults(
        result,
        await cleanupUploadFile(
          path.join(params.directoryPath, entry.name),
          params.now,
          params.maxAgeMs,
        ),
      );
    }

    if (params.now - directoryStat.mtimeMs > params.maxAgeMs) {
      try {
        await fs.rmdir(params.directoryPath);
        result = {
          ...result,
          removedDirectories: result.removedDirectories + 1,
        };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOTEMPTY" && code !== "ENOENT") {
          logger.warn("Failed to remove orphaned import upload directory", {
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
          result = {
            ...result,
            errors: result.errors + 1,
          };
        }
      }
    }
  } catch (error) {
    logger.warn("Failed to inspect orphaned import upload directory", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    result = {
      ...result,
      errors: result.errors + 1,
    };
  }

  return result;
}

async function cleanupImportUploadRoot(params: {
  importTempRootDir: string;
  now: number;
  maxAgeMs: number;
}) {
  if (!await pathExists(params.importTempRootDir)) {
    return emptyCleanupResult();
  }

  let result = emptyCleanupResult();
  const entries = await fs.readdir(params.importTempRootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(IMPORT_UPLOAD_TEMP_DIR_PREFIX)) {
      continue;
    }

    result = addCleanupResults(
      result,
      await cleanupImportUploadDirectory({
        directoryPath: path.join(params.importTempRootDir, entry.name),
        maxAgeMs: params.maxAgeMs,
        now: params.now,
      }),
    );
  }

  return result;
}

export async function cleanupOrphanedUploads(
  options: OrphanedUploadCleanupOptions = {},
): Promise<OrphanedUploadCleanupResult> {
  const now = options.now ?? Date.now();
  const maxAgeMs = Math.max(1, Math.trunc(options.maxAgeMs ?? DEFAULT_ORPHANED_UPLOAD_MAX_AGE_MS));
  const importJobMaxAgeMs = Math.max(
    1,
    Math.trunc(
      options.importJobMaxAgeMs
      ?? options.maxAgeMs
      ?? DEFAULT_IMPORT_JOB_MAX_AGE_MS,
    ),
  );
  const importTempRootDir = options.importTempRootDir ?? process.env.UPLOAD_TMP_DIR ?? os.tmpdir();
  let result = addCleanupResults(
    await cleanupImportUploadRoot({
      importTempRootDir,
      maxAgeMs,
      now,
    }),
    await cleanupReceiptUploadDirectory({
      receiptUploadDir: options.receiptUploadDir ?? COLLECTION_RECEIPT_DIR,
      maxAgeMs,
      now,
    }),
  );
  result = addCleanupResults(
    result,
    await cleanupImportJobDirectory({
      importJobDir: options.importJobDir
        ?? path.resolve(runtimeConfig.app.uploadsRootDir, IMPORT_JOB_DIRECTORY_NAME),
      maxAgeMs: importJobMaxAgeMs,
      now,
    }),
  );

  if (result.removedFiles > 0 || result.removedDirectories > 0 || result.errors > 0) {
    logger.info("Orphaned upload cleanup completed", {
      scannedFiles: result.scannedFiles,
      removedFiles: result.removedFiles,
      removedDirectories: result.removedDirectories,
      errors: result.errors,
    });
  }

  return result;
}

export function startOrphanedUploadCleanupJob(
  options: OrphanedUploadCleanupJobOptions = {},
) {
  if (orphanedUploadCleanupStop) {
    return orphanedUploadCleanupStop;
  }

  const intervalMs = Math.max(
    60_000,
    Math.trunc(options.intervalMs ?? DEFAULT_ORPHANED_UPLOAD_SWEEP_INTERVAL_MS),
  );
  const startupDelayMs = Math.max(
    0,
    Math.trunc(options.startupDelayMs ?? DEFAULT_ORPHANED_UPLOAD_STARTUP_DELAY_MS),
  );
  const cleanup = options.cleanup ?? (() => cleanupOrphanedUploads(options));
  const runCleanup = () => {
    void cleanup().catch((error: unknown) => {
      logger.error("Orphaned upload cleanup job failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    });
  };

  const startupTimer = setTimeout(runCleanup, startupDelayMs);
  startupTimer.unref();
  const interval = setInterval(runCleanup, intervalMs);
  interval.unref();

  orphanedUploadCleanupStop = () => {
    clearTimeout(startupTimer);
    clearInterval(interval);
    orphanedUploadCleanupStop = null;
  };

  return orphanedUploadCleanupStop;
}
