import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { SQL } from "drizzle-orm";
import {
  recoverCollectionReceiptMetadataInDatabase,
  type ExecuteCollectionReceiptRecoveryQuery,
} from "../collection-receipt-recovery-db-utils";
import {
  collectCollectionReceiptRecoveryCandidates,
  inspectCollectionReceiptRecoveryFile,
  normalizeBackupReceiptRecoveryCandidate,
  normalizeLegacyReceiptRecoveryCandidate,
  type InspectedCollectionReceiptRecoveryCandidate,
} from "../collection-receipt-recovery-utils";
import type {
  BackupCollectionReceipt,
  BackupCollectionRecord,
} from "../backups-repository-types";
import type { BackupPayloadChunkReader } from "../backups-restore-shared-utils";

const VALID_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function createBackupReader(params: {
  records?: BackupCollectionRecord[];
  receipts?: BackupCollectionReceipt[];
}): BackupPayloadChunkReader {
  return {
    async *iterateArrayChunks<T>(key: string): AsyncGenerator<T[]> {
      if (key === "collectionRecords" && params.records) {
        yield params.records as T[];
      }
      if (key === "collectionRecordReceipts" && params.receipts) {
        yield params.receipts as T[];
      }
    },
  } as BackupPayloadChunkReader;
}

function createBackupReceipt(
  collectionRecordId: string,
  storagePath: string,
  overrides: Partial<BackupCollectionReceipt> = {},
): BackupCollectionReceipt {
  return {
    id: randomUUID(),
    collectionRecordId,
    storagePath,
    originalFileName: "receipt.png",
    originalMimeType: "image/png",
    originalExtension: ".png",
    fileSize: VALID_PNG.length,
    extractionStatus: "unprocessed",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function flattenSqlChunk(chunk: unknown): string {
  if (chunk === null || chunk === undefined) return "";
  if (typeof chunk === "string") return chunk;
  if (Array.isArray(chunk)) return chunk.map(flattenSqlChunk).join("");
  if (typeof chunk === "object") {
    const candidate = chunk as { value?: unknown; queryChunks?: unknown[] };
    if (candidate.value !== undefined) return flattenSqlChunk(candidate.value);
    if (Array.isArray(candidate.queryChunks)) return candidate.queryChunks.map(flattenSqlChunk).join("");
  }
  return "";
}

function normalizeSqlText(query: SQL): string {
  return flattenSqlChunk(query).replace(/\s+/g, " ").trim();
}

function createInspectedCandidate(
  collectionRecordId: string,
  storagePath: string,
): InspectedCollectionReceiptRecoveryCandidate {
  return {
    collectionRecordId,
    storagePath,
    originalFileName: "receipt.png",
    originalMimeType: "image/png",
    originalExtension: ".png",
    fileSize: VALID_PNG.length,
    fileHash: createHash("sha256").update(VALID_PNG).digest("hex"),
    receiptAmount: null,
    extractedAmount: null,
    extractionStatus: "unprocessed",
    extractionConfidence: null,
    receiptDate: null,
    receiptReference: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    source: "receipt-relation",
  };
}

test("receipt recovery normalization rejects invalid IDs and unmanaged paths", () => {
  const recordId = randomUUID();
  assert.equal(
    normalizeBackupReceiptRecoveryCandidate(createBackupReceipt(recordId, "../receipt.png")),
    null,
  );
  assert.equal(
    normalizeBackupReceiptRecoveryCandidate(createBackupReceipt("record-1", "/uploads/collection-receipts/a.png")),
    null,
  );
  assert.equal(
    normalizeLegacyReceiptRecoveryCandidate({
      id: recordId,
      receiptFile: "/uploads/not-receipts/a.png",
      createdAt: new Date(),
    }),
    null,
  );
});

test("receipt recovery prefers relation metadata over the legacy receipt cache", async () => {
  const recordId = randomUUID();
  const storagePath = "/uploads/collection-receipts/relation-wins.png";
  const reader = createBackupReader({
    records: [{
      id: recordId,
      batch: "P10",
      paymentDate: "2026-01-01",
      amount: "1.00",
      receiptFile: storagePath,
      createdByLogin: "system",
      collectionStaffNickname: "collector",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }],
    receipts: [createBackupReceipt(recordId, storagePath, {
      originalFileName: "relation-name.png",
      receiptAmountCents: 100,
    })],
  });

  const result = await collectCollectionReceiptRecoveryCandidates(reader);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.source, "receipt-relation");
  assert.equal(result.candidates[0]?.originalFileName, "relation-name.png");
  assert.equal(result.candidates[0]?.receiptAmount, 100);
  assert.equal(result.stats.deduplicatedCandidates, 1);
});

test("receipt recovery validates file type and hash before accepting a candidate", async () => {
  const fileName = `recovery-${randomUUID()}.png`;
  const receiptDirectory = path.resolve(process.cwd(), "uploads", "collection-receipts");
  const absolutePath = path.join(receiptDirectory, fileName);
  await fs.mkdir(receiptDirectory, { recursive: true });
  await fs.writeFile(absolutePath, VALID_PNG, { flag: "wx" });

  try {
    const candidate = normalizeBackupReceiptRecoveryCandidate(createBackupReceipt(
      randomUUID(),
      `/uploads/collection-receipts/${fileName}`,
      { fileHash: createHash("sha256").update(VALID_PNG).digest("hex") },
    ));
    assert.ok(candidate);
    const accepted = await inspectCollectionReceiptRecoveryFile(candidate);
    assert.equal(accepted.ok, true);
    if (accepted.ok) {
      assert.equal(accepted.candidate.fileSize, VALID_PNG.length);
      assert.equal(accepted.candidate.originalMimeType, "image/png");
    }

    const mismatch = await inspectCollectionReceiptRecoveryFile({
      ...candidate,
      expectedFileHash: "0".repeat(64),
    });
    assert.deepEqual(mismatch, { ok: false, reason: "file-hash-mismatch" });
  } finally {
    await fs.rm(absolutePath, { force: true });
  }
});

test("receipt recovery reports missing files without leaking their path", async () => {
  const candidate = normalizeBackupReceiptRecoveryCandidate(createBackupReceipt(
    randomUUID(),
    `/uploads/collection-receipts/missing-${randomUUID()}.png`,
  ));
  assert.ok(candidate);
  assert.deepEqual(
    await inspectCollectionReceiptRecoveryFile(candidate),
    { ok: false, reason: "file-missing" },
  );
});

test("receipt recovery dry-run distinguishes active, archived, missing, and recoverable rows", async () => {
  const activeId = randomUUID();
  const archivedId = randomUUID();
  const recoverableId = randomUUID();
  const missingId = randomUUID();
  const candidates = [
    createInspectedCandidate(activeId, "/uploads/collection-receipts/active.png"),
    createInspectedCandidate(archivedId, "/uploads/collection-receipts/archived.png"),
    createInspectedCandidate(recoverableId, "/uploads/collection-receipts/recover.png"),
    createInspectedCandidate(missingId, "/uploads/collection-receipts/missing-record.png"),
  ];
  let queryCount = 0;
  const execute: ExecuteCollectionReceiptRecoveryQuery = async () => {
    queryCount += 1;
    return {
      rows: [
        { recordId: activeId, storagePath: candidates[0]?.storagePath, deletedAt: null },
        { recordId: archivedId, storagePath: candidates[1]?.storagePath, deletedAt: new Date() },
        { recordId: recoverableId, storagePath: null, deletedAt: null },
      ],
    };
  };

  const stats = await recoverCollectionReceiptMetadataInDatabase({
    execute,
    candidates,
    backupId: "backup-1",
    apply: false,
  });
  assert.equal(queryCount, 1);
  assert.equal(stats.alreadyActive, 1);
  assert.equal(stats.alreadyArchived, 1);
  assert.equal(stats.missingCollectionRecords, 1);
  assert.equal(stats.recoverable, 1);
  assert.equal(stats.inserted, 0);
});

test("receipt recovery apply inserts once, refreshes caches, and writes a bounded audit event", async () => {
  const recordId = randomUUID();
  const candidate = createInspectedCandidate(
    recordId,
    "/uploads/collection-receipts/recover.png",
  );
  const queries: string[] = [];
  const responses: Array<{ rows: unknown[] }> = [
    { rows: [{ recordId, storagePath: null, deletedAt: null }] },
    { rows: [{ recordId }] },
    { rows: [{ id: recordId }] },
    { rows: [] },
  ];
  const execute: ExecuteCollectionReceiptRecoveryQuery = async (query) => {
    queries.push(normalizeSqlText(query));
    return responses.shift() ?? { rows: [] };
  };

  const stats = await recoverCollectionReceiptMetadataInDatabase({
    execute,
    candidates: [candidate],
    backupId: "backup-1",
    apply: true,
  });
  assert.equal(stats.inserted, 1);
  assert.equal(stats.recordsRefreshed, 1);
  assert.equal(queries.length, 4);
  assert.match(queries[1] ?? "", /ON CONFLICT DO NOTHING/i);
  assert.match(queries[2] ?? "", /receipt_count/i);
  assert.doesNotMatch(queries[2] ?? "", /receipt_validation_status/i);
  assert.match(queries[3] ?? "", /RECOVER_COLLECTION_RECEIPT_METADATA/i);
});

test("receipt recovery apply remains idempotent when the relation already exists", async () => {
  const recordId = randomUUID();
  const candidate = createInspectedCandidate(
    recordId,
    "/uploads/collection-receipts/existing.png",
  );
  let queryCount = 0;
  const execute: ExecuteCollectionReceiptRecoveryQuery = async () => {
    queryCount += 1;
    return {
      rows: [{ recordId, storagePath: candidate.storagePath.slice(1), deletedAt: null }],
    };
  };

  const stats = await recoverCollectionReceiptMetadataInDatabase({
    execute,
    candidates: [candidate],
    backupId: "backup-1",
    apply: true,
  });
  assert.equal(queryCount, 1);
  assert.equal(stats.alreadyActive, 1);
  assert.equal(stats.inserted, 0);
  assert.equal(stats.recordsRefreshed, 0);
});
