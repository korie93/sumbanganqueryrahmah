import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cleanupOrphanedUploads,
  startOrphanedUploadCleanupJob,
  type OrphanedUploadCleanupResult,
} from "../../jobs/cleanup-orphaned-uploads";

function emptyResult(): OrphanedUploadCleanupResult {
  return {
    scannedFiles: 0,
    removedFiles: 0,
    removedDirectories: 0,
    errors: 0,
  };
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

test("cleanupOrphanedUploads removes only stale .upload files from managed upload locations", async () => {
  const now = Date.now();
  const maxAgeMs = 60 * 60 * 1000;
  const oldDate = new Date(now - maxAgeMs - 10_000);
  const importTempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-orphan-import-root-"));
  const receiptUploadDir = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-orphan-receipts-"));
  const oldImportDir = path.join(importTempRootDir, "sqr-import-upload-old");
  const activeImportDir = path.join(importTempRootDir, "sqr-import-upload-active");
  const unrelatedDir = path.join(importTempRootDir, "not-sqr-import-upload");
  const oldImportUpload = path.join(oldImportDir, "old.upload");
  const activeImportUpload = path.join(activeImportDir, "active.upload");
  const unrelatedUpload = path.join(unrelatedDir, "old.upload");
  const oldReceiptUpload = path.join(receiptUploadDir, "receipt-old.upload");
  const activeReceiptUpload = path.join(receiptUploadDir, "receipt-active.upload");

  try {
    await fs.mkdir(oldImportDir);
    await fs.mkdir(activeImportDir);
    await fs.mkdir(unrelatedDir);
    await fs.writeFile(oldImportUpload, "old", "utf8");
    await fs.writeFile(activeImportUpload, "active", "utf8");
    await fs.writeFile(unrelatedUpload, "unrelated", "utf8");
    await fs.writeFile(oldReceiptUpload, "old receipt", "utf8");
    await fs.writeFile(activeReceiptUpload, "active receipt", "utf8");
    await fs.utimes(oldImportUpload, oldDate, oldDate);
    await fs.utimes(oldImportDir, oldDate, oldDate);
    await fs.utimes(unrelatedUpload, oldDate, oldDate);
    await fs.utimes(unrelatedDir, oldDate, oldDate);
    await fs.utimes(oldReceiptUpload, oldDate, oldDate);

    const result = await cleanupOrphanedUploads({
      importTempRootDir,
      maxAgeMs,
      now,
      receiptUploadDir,
    });

    assert.equal(result.removedFiles, 2);
    assert.equal(result.removedDirectories, 1);
    assert.equal(result.errors, 0);
    assert.equal(await pathExists(oldImportUpload), false);
    assert.equal(await pathExists(oldImportDir), false);
    assert.equal(await pathExists(oldReceiptUpload), false);
    assert.equal(await pathExists(activeImportUpload), true);
    assert.equal(await pathExists(activeReceiptUpload), true);
    assert.equal(await pathExists(unrelatedUpload), true);
  } finally {
    await fs.rm(importTempRootDir, { recursive: true, force: true });
    await fs.rm(receiptUploadDir, { recursive: true, force: true });
  }
});

test("startOrphanedUploadCleanupJob keeps a singleton interval and exposes cleanup", async () => {
  let cleanupRuns = 0;
  const stopFirst = startOrphanedUploadCleanupJob({
    intervalMs: 60_000,
    startupDelayMs: 0,
    cleanup: async () => {
      cleanupRuns += 1;
      return emptyResult();
    },
  });
  const stopSecond = startOrphanedUploadCleanupJob({
    intervalMs: 60_000,
    startupDelayMs: 0,
    cleanup: async () => {
      cleanupRuns += 100;
      return emptyResult();
    },
  });

  assert.equal(stopSecond, stopFirst);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cleanupRuns, 1);
  stopFirst();

  const stopThird = startOrphanedUploadCleanupJob({
    intervalMs: 60_000,
    startupDelayMs: 0,
    cleanup: async () => {
      cleanupRuns += 1;
      return emptyResult();
    },
  });

  assert.notEqual(stopThird, stopFirst);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cleanupRuns, 2);
  stopThird();
});
