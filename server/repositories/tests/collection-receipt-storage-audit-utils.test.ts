import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { SQL } from "drizzle-orm";
import {
  auditCollectionReceiptStorage,
  collectCollectionReceiptReferenceInventory,
  scanCollectionReceiptPhysicalInventory,
  type ExecuteCollectionReceiptStorageAuditQuery,
} from "../collection-receipt-storage-audit-utils";

const DAY_MS = 24 * 60 * 60 * 1000;

function flattenSqlChunk(chunk: unknown): string {
  if (chunk === null || chunk === undefined) return "";
  if (typeof chunk === "string") return chunk;
  if (Array.isArray(chunk)) return chunk.map(flattenSqlChunk).join("");
  if (typeof chunk === "object") {
    const candidate = chunk as { value?: unknown; queryChunks?: unknown[] };
    if (candidate.value !== undefined) return flattenSqlChunk(candidate.value);
    if (Array.isArray(candidate.queryChunks)) {
      return candidate.queryChunks.map(flattenSqlChunk).join("");
    }
  }
  return "";
}

function normalizeSqlText(query: SQL): string {
  return flattenSqlChunk(query).replace(/\s+/g, " ").trim();
}

test("receipt storage reference audit remains read-only and classifies bounded paths", async () => {
  const queries: string[] = [];
  const execute: ExecuteCollectionReceiptStorageAuditQuery = async (query) => {
    queries.push(normalizeSqlText(query));
    return {
      rows: [
        { source: "relation", storagePath: "/uploads/collection-receipts/active.png", deletedAt: null },
        { source: "relation", storagePath: "uploads/collection-receipts/active.png", deletedAt: null },
        { source: "relation", storagePath: "/uploads/collection-receipts/archive.pdf", deletedAt: new Date() },
        { source: "relation", storagePath: "../outside.pdf", deletedAt: null },
        { source: "cache", storagePath: "/uploads/collection-receipts/active.png", deletedAt: null },
        { source: "cache", storagePath: "/uploads/collection-receipts/cache-only.webp", deletedAt: null },
      ],
    };
  };

  const inventory = await collectCollectionReceiptReferenceInventory({ execute });

  assert.equal(queries.length, 1);
  assert.match(queries[0] ?? "", /^SELECT /i);
  assert.doesNotMatch(queries[0] ?? "", /\b(?:DELETE|INSERT|UPDATE|TRUNCATE|ALTER|DROP)\b/i);
  assert.equal(inventory.stats.activeRelationRows, 3);
  assert.equal(inventory.stats.archivedRelationRows, 1);
  assert.equal(inventory.stats.cacheRows, 2);
  assert.equal(inventory.stats.invalidReferenceRows, 1);
  assert.equal(inventory.stats.uniqueReferencedPaths, 3);
  assert.equal(inventory.stats.multiplyReferencedPaths, 1);
  assert.equal(inventory.stats.excessRelationReferences, 1);
  assert.equal(inventory.stats.cacheOnlyPaths, 1);
});

test("receipt storage reference audit fails closed when its row bound is exceeded", async () => {
  const execute: ExecuteCollectionReceiptStorageAuditQuery = async () => ({
    rows: [
      { source: "relation", storagePath: "/uploads/collection-receipts/a.png", deletedAt: null },
      { source: "relation", storagePath: "/uploads/collection-receipts/b.png", deletedAt: null },
      { source: "relation", storagePath: "/uploads/collection-receipts/c.png", deletedAt: null },
    ],
  });

  await assert.rejects(
    collectCollectionReceiptReferenceInventory({ execute, maxReferenceRows: 2 }),
    /reference audit limit exceeded/i,
  );
});

test("receipt storage audit reconciles nested files without exposing names or following symlinks", async () => {
  const now = Date.parse("2026-07-14T08:00:00.000Z");
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-receipt-audit-"));
  const uploadsRootDir = path.join(workspace, "uploads");
  const receiptDir = path.join(uploadsRootDir, "collection-receipts");
  const nestedDir = path.join(receiptDir, "nested");
  const outsideFile = path.join(workspace, "outside.png");
  let symlinkCreated = false;

  await fs.mkdir(nestedDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(receiptDir, "active.png"), "active"),
    fs.writeFile(path.join(nestedDir, "archive.pdf"), "archive"),
    fs.writeFile(path.join(receiptDir, "cache-only.webp"), "cache"),
    fs.writeFile(path.join(receiptDir, "orphan-old.pdf"), "old orphan"),
    fs.writeFile(path.join(receiptDir, "orphan-new.jpg"), "new orphan"),
    fs.writeFile(path.join(receiptDir, "unsupported.exe"), "unsupported"),
    fs.writeFile(path.join(receiptDir, "zero.png"), ""),
    fs.writeFile(path.join(receiptDir, "pending.upload"), "temporary"),
    fs.writeFile(outsideFile, "outside"),
  ]);
  const oldDate = new Date(now - 40 * DAY_MS);
  await Promise.all([
    fs.utimes(path.join(receiptDir, "orphan-old.pdf"), oldDate, oldDate),
    fs.utimes(path.join(receiptDir, "pending.upload"), oldDate, oldDate),
  ]);
  try {
    await fs.symlink(outsideFile, path.join(receiptDir, "outside-link.png"), "file");
    symlinkCreated = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }

  const execute: ExecuteCollectionReceiptStorageAuditQuery = async () => ({
    rows: [
      { source: "relation", storagePath: "/uploads/collection-receipts/active.png", deletedAt: null },
      { source: "relation", storagePath: "/uploads/collection-receipts/missing.png", deletedAt: null },
      { source: "relation", storagePath: "/uploads/collection-receipts/nested/archive.pdf", deletedAt: new Date() },
      { source: "cache", storagePath: "/uploads/collection-receipts/active.png", deletedAt: null },
      { source: "cache", storagePath: "/uploads/collection-receipts/cache-only.webp", deletedAt: null },
    ],
  });

  try {
    const report = await auditCollectionReceiptStorage({
      execute,
      receiptDir,
      uploadsRootDir,
      now,
      staleAfterMs: 30 * DAY_MS,
    });

    assert.equal(report.mode, "read-only");
    assert.equal(report.writesPerformed, 0);
    assert.equal(report.status, "review-required");
    assert.equal(report.filesystem.directoryPresent, true);
    assert.equal(report.filesystem.regularFiles, 7);
    assert.equal(report.filesystem.temporaryUploadFiles, 1);
    assert.equal(report.filesystem.staleTemporaryUploadFiles, 1);
    assert.equal(report.filesystem.nestedDirectories, 1);
    assert.equal(report.filesystem.symbolicLinks, symlinkCreated ? 1 : 0);
    assert.equal(report.filesystem.unsupportedExtensionFiles, 1);
    assert.equal(report.filesystem.invalidSizeFiles, 1);
    assert.equal(report.reconciliation.referencedAndPresent, 3);
    assert.equal(report.reconciliation.referencedButMissing, 1);
    assert.equal(report.reconciliation.activeReferencesMissing, 1);
    assert.equal(report.reconciliation.unreferencedFiles, 4);
    assert.equal(report.reconciliation.staleUnreferencedFiles, 1);

    const serialized = JSON.stringify(report);
    for (const sensitiveName of [
      "active.png",
      "archive.pdf",
      "cache-only.webp",
      "orphan-old.pdf",
      "outside-link.png",
    ]) {
      assert.doesNotMatch(serialized, new RegExp(sensitiveName.replace(".", "\\.")));
    }
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("receipt storage filesystem audit fails closed at its entry limit", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-receipt-limit-"));
  const uploadsRootDir = path.join(workspace, "uploads");
  const receiptDir = path.join(uploadsRootDir, "collection-receipts");
  await fs.mkdir(receiptDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(receiptDir, "one.png"), "one"),
    fs.writeFile(path.join(receiptDir, "two.png"), "two"),
  ]);

  try {
    await assert.rejects(
      scanCollectionReceiptPhysicalInventory({
        receiptDir,
        uploadsRootDir,
        maxFilesystemEntries: 1,
      }),
      /filesystem audit limit exceeded/i,
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("receipt storage audit reports an unavailable root without changing data", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-receipt-missing-root-"));
  const uploadsRootDir = path.join(workspace, "uploads");
  const receiptDir = path.join(uploadsRootDir, "collection-receipts");
  await fs.mkdir(uploadsRootDir, { recursive: true });
  const execute: ExecuteCollectionReceiptStorageAuditQuery = async () => ({ rows: [] });

  try {
    const report = await auditCollectionReceiptStorage({
      execute,
      receiptDir,
      uploadsRootDir,
      now: Date.parse("2026-07-14T08:00:00.000Z"),
    });
    assert.equal(report.status, "storage-unavailable");
    assert.equal(report.filesystem.directoryPresent, false);
    assert.equal(report.writesPerformed, 0);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
