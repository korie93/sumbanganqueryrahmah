import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseCollectionAmountToCents,
  parseStoredCollectionAmountCents,
} from "../../shared/collection-amount-types";
import {
  detectCollectionReceiptSignature,
  validateCollectionReceiptSecurity,
} from "../lib/collection-receipt-security";
import {
  COLLECTION_RECEIPT_DIR,
  resolveCollectionReceiptStoragePath,
} from "../lib/collection-receipt-files";
import { isPathInsideDirectory } from "../config/upload-paths";
import { normalizeCollectionReceiptExtractionState } from "../lib/collection-receipt-extraction-state";
import {
  COLLECTION_RECEIPT_MAX_BYTES,
  COLLECTION_RECEIPT_TYPE_CONFIG,
  mapCollectionReceiptExtensionToType,
  sanitizeOriginalFileName,
} from "../routes/collection-receipt-file-type-utils";
import type {
  BackupCollectionReceipt,
  BackupCollectionRecord,
} from "./backups-repository-types";
import type { BackupPayloadChunkReader } from "./backups-restore-shared-utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_RECOVERY_CANDIDATES = 100_000;
const MAX_STORAGE_PATH_LENGTH = 512;
const MAX_RECEIPT_REFERENCE_LENGTH = 512;

export type CollectionReceiptRecoveryCandidate = {
  collectionRecordId: string;
  storagePath: string;
  originalFileName: string;
  receiptAmount: number | null;
  extractedAmount: number | null;
  extractionStatus: string;
  extractionConfidence: number | null;
  receiptDate: string | null;
  receiptReference: string | null;
  expectedFileHash: string | null;
  createdAt: Date | null;
  source: "legacy-cache" | "receipt-relation";
};

export type InspectedCollectionReceiptRecoveryCandidate = Omit<
  CollectionReceiptRecoveryCandidate,
  "expectedFileHash"
> & {
  originalMimeType: string;
  originalExtension: string;
  fileSize: number;
  fileHash: string;
  createdAt: Date;
};

export type CollectionReceiptRecoveryCandidateStats = {
  backupCollectionRecords: number;
  backupReceiptRelations: number;
  legacyReceiptPaths: number;
  invalidCandidates: number;
  deduplicatedCandidates: number;
};

export type CollectionReceiptRecoveryFileRejectionReason =
  | "file-missing"
  | "file-not-regular"
  | "file-size-invalid"
  | "file-read-failed"
  | "file-type-unsupported"
  | "file-extension-mismatch"
  | "file-security-invalid"
  | "file-hash-mismatch";

export type CollectionReceiptRecoveryFileInspection =
  | {
      ok: true;
      candidate: InspectedCollectionReceiptRecoveryCandidate;
    }
  | {
      ok: false;
      reason: CollectionReceiptRecoveryFileRejectionReason;
    };

function normalizeBoundedText(value: unknown, maxLength: number): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeDateOnly(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const candidate = value.slice(0, 10);
    const parsed = new Date(`${candidate}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
      ? candidate
      : null;
  }
  return normalizeDate(value)?.toISOString().slice(0, 10) ?? null;
}

function normalizeConfidence(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function normalizeStoragePath(value: unknown): string | null {
  const rawPath = normalizeBoundedText(value, MAX_STORAGE_PATH_LENGTH);
  if (!rawPath) return null;
  const resolved = resolveCollectionReceiptStoragePath(rawPath);
  if (!resolved?.isManagedCollectionReceipt) return null;
  return resolved.publicPath;
}

function createCandidateKey(candidate: Pick<CollectionReceiptRecoveryCandidate, "collectionRecordId" | "storagePath">) {
  return `${candidate.collectionRecordId}\u0000${candidate.storagePath}`;
}

export function normalizeBackupReceiptRecoveryCandidate(
  receipt: BackupCollectionReceipt,
): CollectionReceiptRecoveryCandidate | null {
  const collectionRecordId = String(receipt.collectionRecordId ?? "").trim().toLowerCase();
  const storagePath = normalizeStoragePath(receipt.storagePath);
  if (!UUID_PATTERN.test(collectionRecordId) || !storagePath) return null;

  const receiptState = normalizeCollectionReceiptExtractionState({
    receiptAmountCents:
      parseStoredCollectionAmountCents(receipt.receiptAmountCents)
      ?? parseCollectionAmountToCents(receipt.receiptAmount, { allowZero: true }),
    extractedAmountCents:
      parseStoredCollectionAmountCents(receipt.extractedAmountCents)
      ?? parseCollectionAmountToCents(receipt.extractedAmount, { allowZero: true }),
    extractionStatus: normalizeBoundedText(receipt.extractionStatus, 64) ?? "unprocessed",
  });
  const expectedFileHash = String(receipt.fileHash ?? "").trim().toLowerCase();

  return {
    collectionRecordId,
    storagePath,
    originalFileName: normalizeBoundedText(receipt.originalFileName, 200) ?? path.basename(storagePath),
    receiptAmount: receiptState.receiptAmountCents,
    extractedAmount: receiptState.extractedAmountCents,
    extractionStatus: receiptState.extractionStatus,
    extractionConfidence: normalizeConfidence(receipt.extractionConfidence),
    receiptDate: normalizeDateOnly(receipt.receiptDate),
    receiptReference: normalizeBoundedText(receipt.receiptReference, MAX_RECEIPT_REFERENCE_LENGTH),
    expectedFileHash: SHA256_PATTERN.test(expectedFileHash) ? expectedFileHash : null,
    createdAt: normalizeDate(receipt.createdAt),
    source: "receipt-relation",
  };
}

export function normalizeLegacyReceiptRecoveryCandidate(
  record: Pick<BackupCollectionRecord, "id" | "receiptFile" | "createdAt">,
): CollectionReceiptRecoveryCandidate | null {
  const collectionRecordId = String(record.id ?? "").trim().toLowerCase();
  const storagePath = normalizeStoragePath(record.receiptFile);
  if (!UUID_PATTERN.test(collectionRecordId) || !storagePath) return null;

  return {
    collectionRecordId,
    storagePath,
    originalFileName: path.basename(storagePath) || "receipt",
    receiptAmount: null,
    extractedAmount: null,
    extractionStatus: "unprocessed",
    extractionConfidence: null,
    receiptDate: null,
    receiptReference: null,
    expectedFileHash: null,
    createdAt: normalizeDate(record.createdAt),
    source: "legacy-cache",
  };
}

export async function collectCollectionReceiptRecoveryCandidates(
  reader: BackupPayloadChunkReader,
): Promise<{
  candidates: CollectionReceiptRecoveryCandidate[];
  stats: CollectionReceiptRecoveryCandidateStats;
}> {
  const candidateMap = new Map<string, CollectionReceiptRecoveryCandidate>();
  const stats: CollectionReceiptRecoveryCandidateStats = {
    backupCollectionRecords: 0,
    backupReceiptRelations: 0,
    legacyReceiptPaths: 0,
    invalidCandidates: 0,
    deduplicatedCandidates: 0,
  };

  const addCandidate = (candidate: CollectionReceiptRecoveryCandidate) => {
    const key = createCandidateKey(candidate);
    if (candidateMap.has(key)) {
      stats.deduplicatedCandidates += 1;
    }
    candidateMap.set(key, candidate);
    if (candidateMap.size > MAX_RECOVERY_CANDIDATES) {
      throw new Error("Receipt recovery candidate limit exceeded.");
    }
  };

  for await (const chunk of reader.iterateArrayChunks<BackupCollectionRecord>("collectionRecords", 500)) {
    for (const record of chunk) {
      stats.backupCollectionRecords += 1;
      if (!String(record.receiptFile ?? "").trim()) continue;
      stats.legacyReceiptPaths += 1;
      const candidate = normalizeLegacyReceiptRecoveryCandidate(record);
      if (!candidate) {
        stats.invalidCandidates += 1;
        continue;
      }
      addCandidate(candidate);
    }
  }

  for await (const chunk of reader.iterateArrayChunks<BackupCollectionReceipt>(
    "collectionRecordReceipts",
    500,
  )) {
    for (const receipt of chunk) {
      stats.backupReceiptRelations += 1;
      const candidate = normalizeBackupReceiptRecoveryCandidate(receipt);
      if (!candidate) {
        stats.invalidCandidates += 1;
        continue;
      }
      addCandidate(candidate);
    }
  }

  return {
    candidates: Array.from(candidateMap.values()),
    stats,
  };
}

export async function inspectCollectionReceiptRecoveryFile(
  candidate: CollectionReceiptRecoveryCandidate,
): Promise<CollectionReceiptRecoveryFileInspection> {
  const resolved = resolveCollectionReceiptStoragePath(candidate.storagePath);
  if (!resolved?.isManagedCollectionReceipt) {
    return { ok: false, reason: "file-read-failed" };
  }

  try {
    const [realReceiptDirectory, realReceiptPath] = await Promise.all([
      fs.realpath(COLLECTION_RECEIPT_DIR),
      fs.realpath(resolved.absolutePath),
    ]);
    if (!isPathInsideDirectory({
      parentDir: realReceiptDirectory,
      candidatePath: realReceiptPath,
    })) {
      return { ok: false, reason: "file-not-regular" };
    }
  } catch {
    return { ok: false, reason: "file-missing" };
  }

  let fileStat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    fileStat = await fs.lstat(resolved.absolutePath);
  } catch {
    return { ok: false, reason: "file-missing" };
  }
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    return { ok: false, reason: "file-not-regular" };
  }
  if (fileStat.size <= 0 || fileStat.size > COLLECTION_RECEIPT_MAX_BYTES) {
    return { ok: false, reason: "file-size-invalid" };
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolved.absolutePath);
  } catch {
    return { ok: false, reason: "file-read-failed" };
  }
  if (buffer.length !== fileStat.size) {
    return { ok: false, reason: "file-read-failed" };
  }

  const signatureType = detectCollectionReceiptSignature(buffer);
  if (!signatureType) {
    return { ok: false, reason: "file-type-unsupported" };
  }
  const pathType = mapCollectionReceiptExtensionToType(path.extname(resolved.storedFileName));
  if (!pathType || pathType !== signatureType) {
    return { ok: false, reason: "file-extension-mismatch" };
  }
  try {
    validateCollectionReceiptSecurity(buffer, signatureType);
  } catch {
    return { ok: false, reason: "file-security-invalid" };
  }

  const actualFileHash = createHash("sha256").update(buffer).digest("hex");
  if (candidate.expectedFileHash && candidate.expectedFileHash !== actualFileHash) {
    return { ok: false, reason: "file-hash-mismatch" };
  }
  const canonicalType = COLLECTION_RECEIPT_TYPE_CONFIG[signatureType];
  const originalNameExtension = path.extname(candidate.originalFileName);
  const originalNameStem = path.basename(candidate.originalFileName, originalNameExtension);

  return {
    ok: true,
    candidate: {
      collectionRecordId: candidate.collectionRecordId,
      storagePath: resolved.publicPath,
      originalFileName: sanitizeOriginalFileName(originalNameStem, canonicalType.extension),
      originalMimeType: canonicalType.mimeType,
      originalExtension: canonicalType.extension,
      fileSize: fileStat.size,
      fileHash: actualFileHash,
      receiptAmount: candidate.receiptAmount,
      extractedAmount: candidate.extractedAmount,
      extractionStatus: candidate.extractionStatus,
      extractionConfidence: candidate.extractionConfidence,
      receiptDate: candidate.receiptDate,
      receiptReference: candidate.receiptReference,
      createdAt: candidate.createdAt ?? fileStat.mtime,
      source: candidate.source,
    },
  };
}
