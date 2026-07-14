import fs from "node:fs/promises";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { isPathInsideDirectory } from "../config/upload-paths";
import {
  COLLECTION_RECEIPT_DIR,
  COLLECTION_RECEIPT_PUBLIC_PREFIX,
  COLLECTION_UPLOADS_ROOT_DIR,
  resolveCollectionReceiptStoragePath,
} from "../lib/collection-receipt-files";

const DEFAULT_MAX_REFERENCE_ROWS = 200_000;
const DEFAULT_MAX_FILESYSTEM_ENTRIES = 200_000;
const DEFAULT_MAX_DIRECTORY_DEPTH = 8;
const DEFAULT_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const TEMP_UPLOAD_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_STORAGE_PATH_LENGTH = 512;
const MAX_RECEIPT_FILE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_RECEIPT_EXTENSIONS = new Set([".jpeg", ".jpg", ".pdf", ".png", ".webp"]);

export type CollectionReceiptStorageAuditQueryResult = {
  rows?: readonly unknown[];
};

export type ExecuteCollectionReceiptStorageAuditQuery = (
  query: SQL,
) => Promise<CollectionReceiptStorageAuditQueryResult>;

type ReceiptReferenceRow = {
  source?: unknown;
  storagePath?: unknown;
  deletedAt?: unknown;
};

export type CollectionReceiptReferenceInventory = {
  activePaths: Set<string>;
  archivedPaths: Set<string>;
  cachePaths: Set<string>;
  allReferencedPaths: Set<string>;
  stats: {
    activeRelationRows: number;
    archivedRelationRows: number;
    cacheRows: number;
    invalidReferenceRows: number;
    uniqueActivePaths: number;
    uniqueArchivedPaths: number;
    uniqueCachePaths: number;
    uniqueReferencedPaths: number;
    multiplyReferencedPaths: number;
    excessRelationReferences: number;
    cacheOnlyPaths: number;
  };
};

type PhysicalReceiptFile = {
  size: number;
  mtimeMs: number;
};

export type CollectionReceiptPhysicalInventory = {
  files: Map<string, PhysicalReceiptFile>;
  stats: {
    directoryPresent: boolean;
    regularFiles: number;
    regularFileBytes: number;
    temporaryUploadFiles: number;
    staleTemporaryUploadFiles: number;
    temporaryUploadBytes: number;
    nestedDirectories: number;
    symbolicLinks: number;
    specialEntries: number;
    unsupportedExtensionFiles: number;
    invalidSizeFiles: number;
    inspectionErrors: number;
    depthLimitExceeded: number;
  };
};

export type CollectionReceiptStorageAuditReport = {
  schemaVersion: 1;
  mode: "read-only";
  generatedAt: string;
  staleAfterDays: number;
  status: "clean" | "review-required" | "storage-unavailable";
  database: CollectionReceiptReferenceInventory["stats"];
  filesystem: CollectionReceiptPhysicalInventory["stats"];
  reconciliation: {
    referencedAndPresent: number;
    referencedButMissing: number;
    activeReferencesMissing: number;
    archivedReferencesMissing: number;
    cacheReferencesMissing: number;
    unreferencedFiles: number;
    unreferencedFileBytes: number;
    staleUnreferencedFiles: number;
    staleUnreferencedFileBytes: number;
  };
  writesPerformed: 0;
};

function readRows<T>(result: CollectionReceiptStorageAuditQueryResult): T[] {
  return Array.isArray(result.rows) ? result.rows as T[] : [];
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value ?? fallback));
}

function normalizeManagedStoragePath(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > MAX_STORAGE_PATH_LENGTH) return null;
  if (Array.from(raw).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })) {
    return null;
  }
  const resolved = resolveCollectionReceiptStoragePath(raw);
  return resolved?.isManagedCollectionReceipt ? resolved.publicPath : null;
}

function isArchivedValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function addSafeInteger(left: number, right: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, left + Math.max(0, right));
}

export async function collectCollectionReceiptReferenceInventory(params: {
  execute: ExecuteCollectionReceiptStorageAuditQuery;
  maxReferenceRows?: number;
}): Promise<CollectionReceiptReferenceInventory> {
  const maxReferenceRows = normalizePositiveInteger(
    params.maxReferenceRows,
    DEFAULT_MAX_REFERENCE_ROWS,
  );
  const result = await params.execute(sql`
    SELECT
      'relation'::text AS source,
      storage_path AS "storagePath",
      deleted_at AS "deletedAt"
    FROM public.collection_record_receipts

    UNION ALL

    SELECT
      'cache'::text AS source,
      receipt_file AS "storagePath",
      NULL::timestamptz AS "deletedAt"
    FROM public.collection_records
    WHERE receipt_file IS NOT NULL
      AND btrim(receipt_file) <> ''

    LIMIT ${maxReferenceRows + 1}
  `);
  const rows = readRows<ReceiptReferenceRow>(result);
  if (rows.length > maxReferenceRows) {
    throw new Error("Receipt storage reference audit limit exceeded.");
  }

  const activePaths = new Set<string>();
  const archivedPaths = new Set<string>();
  const cachePaths = new Set<string>();
  const relationPathCounts = new Map<string, number>();
  let activeRelationRows = 0;
  let archivedRelationRows = 0;
  let cacheRows = 0;
  let invalidReferenceRows = 0;

  for (const row of rows) {
    const source = String(row.source ?? "").trim().toLowerCase();
    const storagePath = normalizeManagedStoragePath(row.storagePath);
    if (source === "cache") {
      cacheRows += 1;
      if (storagePath) {
        cachePaths.add(storagePath);
      } else {
        invalidReferenceRows += 1;
      }
      continue;
    }
    if (source !== "relation") {
      invalidReferenceRows += 1;
      continue;
    }

    const archived = isArchivedValue(row.deletedAt);
    if (archived) {
      archivedRelationRows += 1;
    } else {
      activeRelationRows += 1;
    }
    if (!storagePath) {
      invalidReferenceRows += 1;
      continue;
    }

    (archived ? archivedPaths : activePaths).add(storagePath);
    relationPathCounts.set(storagePath, (relationPathCounts.get(storagePath) ?? 0) + 1);
  }

  const allReferencedPaths = new Set([...activePaths, ...archivedPaths, ...cachePaths]);
  const relationPaths = new Set([...activePaths, ...archivedPaths]);
  let multiplyReferencedPaths = 0;
  let excessRelationReferences = 0;
  for (const count of relationPathCounts.values()) {
    if (count <= 1) continue;
    multiplyReferencedPaths += 1;
    excessRelationReferences += count - 1;
  }
  let cacheOnlyPaths = 0;
  for (const storagePath of cachePaths) {
    if (!relationPaths.has(storagePath)) cacheOnlyPaths += 1;
  }

  return {
    activePaths,
    archivedPaths,
    cachePaths,
    allReferencedPaths,
    stats: {
      activeRelationRows,
      archivedRelationRows,
      cacheRows,
      invalidReferenceRows,
      uniqueActivePaths: activePaths.size,
      uniqueArchivedPaths: archivedPaths.size,
      uniqueCachePaths: cachePaths.size,
      uniqueReferencedPaths: allReferencedPaths.size,
      multiplyReferencedPaths,
      excessRelationReferences,
      cacheOnlyPaths,
    },
  };
}

function emptyPhysicalInventory(): CollectionReceiptPhysicalInventory {
  return {
    files: new Map(),
    stats: {
      directoryPresent: false,
      regularFiles: 0,
      regularFileBytes: 0,
      temporaryUploadFiles: 0,
      staleTemporaryUploadFiles: 0,
      temporaryUploadBytes: 0,
      nestedDirectories: 0,
      symbolicLinks: 0,
      specialEntries: 0,
      unsupportedExtensionFiles: 0,
      invalidSizeFiles: 0,
      inspectionErrors: 0,
      depthLimitExceeded: 0,
    },
  };
}

function isMissingFilesystemError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

export async function scanCollectionReceiptPhysicalInventory(params: {
  receiptDir?: string;
  uploadsRootDir?: string;
  now?: number;
  maxFilesystemEntries?: number;
  maxDirectoryDepth?: number;
} = {}): Promise<CollectionReceiptPhysicalInventory> {
  const receiptDir = path.resolve(params.receiptDir ?? COLLECTION_RECEIPT_DIR);
  const uploadsRootDir = path.resolve(params.uploadsRootDir ?? COLLECTION_UPLOADS_ROOT_DIR);
  const now = Number.isFinite(params.now) ? Number(params.now) : Date.now();
  const maxFilesystemEntries = normalizePositiveInteger(
    params.maxFilesystemEntries,
    DEFAULT_MAX_FILESYSTEM_ENTRIES,
  );
  const maxDirectoryDepth = normalizePositiveInteger(
    params.maxDirectoryDepth,
    DEFAULT_MAX_DIRECTORY_DEPTH,
  );
  const inventory = emptyPhysicalInventory();

  let rootStat;
  try {
    rootStat = await fs.lstat(receiptDir);
  } catch (error) {
    if (isMissingFilesystemError(error)) return inventory;
    throw new Error("Receipt storage root could not be inspected.");
  }
  if (rootStat.isSymbolicLink()) {
    inventory.stats.symbolicLinks += 1;
    return inventory;
  }
  if (!rootStat.isDirectory()) {
    inventory.stats.specialEntries += 1;
    return inventory;
  }

  let realUploadsRoot: string;
  let realReceiptRoot: string;
  try {
    [realUploadsRoot, realReceiptRoot] = await Promise.all([
      fs.realpath(uploadsRootDir),
      fs.realpath(receiptDir),
    ]);
  } catch {
    throw new Error("Receipt storage root could not be resolved.");
  }
  if (
    realReceiptRoot === realUploadsRoot
    || !isPathInsideDirectory({ parentDir: realUploadsRoot, candidatePath: realReceiptRoot })
  ) {
    throw new Error("Receipt storage root resolves outside managed uploads.");
  }

  inventory.stats.directoryPresent = true;
  const queue: Array<{ directoryPath: string; relativeDirectory: string; depth: number }> = [{
    directoryPath: receiptDir,
    relativeDirectory: "",
    depth: 0,
  }];
  let scannedEntries = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    let realCurrentDirectory: string;
    try {
      realCurrentDirectory = await fs.realpath(current.directoryPath);
    } catch {
      inventory.stats.inspectionErrors += 1;
      continue;
    }
    if (!isPathInsideDirectory({ parentDir: realReceiptRoot, candidatePath: realCurrentDirectory })) {
      inventory.stats.inspectionErrors += 1;
      continue;
    }

    let directory;
    try {
      directory = await fs.opendir(current.directoryPath);
    } catch {
      inventory.stats.inspectionErrors += 1;
      continue;
    }

    for await (const entry of directory) {
      scannedEntries += 1;
      if (scannedEntries > maxFilesystemEntries) {
        throw new Error("Receipt storage filesystem audit limit exceeded.");
      }
      const entryPath = path.join(current.directoryPath, entry.name);
      const relativeEntryPath = path.join(current.relativeDirectory, entry.name);
      let entryStat;
      try {
        entryStat = await fs.lstat(entryPath);
      } catch {
        inventory.stats.inspectionErrors += 1;
        continue;
      }

      if (entryStat.isSymbolicLink()) {
        inventory.stats.symbolicLinks += 1;
        continue;
      }
      if (entryStat.isDirectory()) {
        inventory.stats.nestedDirectories += 1;
        if (current.depth >= maxDirectoryDepth) {
          inventory.stats.depthLimitExceeded += 1;
          continue;
        }
        queue.push({
          directoryPath: entryPath,
          relativeDirectory: relativeEntryPath,
          depth: current.depth + 1,
        });
        continue;
      }
      if (!entryStat.isFile()) {
        inventory.stats.specialEntries += 1;
        continue;
      }

      const portableRelativePath = relativeEntryPath.replace(/\\/g, "/");
      const storagePath = normalizeManagedStoragePath(
        `${COLLECTION_RECEIPT_PUBLIC_PREFIX}/${portableRelativePath}`,
      );
      if (!storagePath) {
        inventory.stats.inspectionErrors += 1;
        continue;
      }
      const fileSize = Number.isSafeInteger(entryStat.size) && entryStat.size >= 0
        ? entryStat.size
        : 0;
      if (entry.name.endsWith(".upload")) {
        inventory.stats.temporaryUploadFiles += 1;
        inventory.stats.temporaryUploadBytes = addSafeInteger(
          inventory.stats.temporaryUploadBytes,
          fileSize,
        );
        if (now - entryStat.mtimeMs > TEMP_UPLOAD_STALE_AFTER_MS) {
          inventory.stats.staleTemporaryUploadFiles += 1;
        }
        continue;
      }

      inventory.files.set(storagePath, { size: fileSize, mtimeMs: entryStat.mtimeMs });
      inventory.stats.regularFiles += 1;
      inventory.stats.regularFileBytes = addSafeInteger(
        inventory.stats.regularFileBytes,
        fileSize,
      );
      if (!SUPPORTED_RECEIPT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        inventory.stats.unsupportedExtensionFiles += 1;
      }
      if (fileSize <= 0 || fileSize > MAX_RECEIPT_FILE_BYTES) {
        inventory.stats.invalidSizeFiles += 1;
      }
    }
  }

  return inventory;
}

function countMissing(paths: Set<string>, physicalPaths: Map<string, PhysicalReceiptFile>): number {
  let missing = 0;
  for (const storagePath of paths) {
    if (!physicalPaths.has(storagePath)) missing += 1;
  }
  return missing;
}

export function reconcileCollectionReceiptStorage(params: {
  references: CollectionReceiptReferenceInventory;
  physical: CollectionReceiptPhysicalInventory;
  now?: number;
  staleAfterMs?: number;
}): CollectionReceiptStorageAuditReport {
  const now = Number.isFinite(params.now) ? Number(params.now) : Date.now();
  const staleAfterMs = normalizePositiveInteger(params.staleAfterMs, DEFAULT_STALE_AFTER_MS);
  let referencedAndPresent = 0;
  for (const storagePath of params.references.allReferencedPaths) {
    if (params.physical.files.has(storagePath)) referencedAndPresent += 1;
  }
  const referencedButMissing = params.references.allReferencedPaths.size - referencedAndPresent;
  let unreferencedFiles = 0;
  let unreferencedFileBytes = 0;
  let staleUnreferencedFiles = 0;
  let staleUnreferencedFileBytes = 0;
  for (const [storagePath, file] of params.physical.files) {
    if (params.references.allReferencedPaths.has(storagePath)) continue;
    unreferencedFiles += 1;
    unreferencedFileBytes = addSafeInteger(unreferencedFileBytes, file.size);
    if (now - file.mtimeMs > staleAfterMs) {
      staleUnreferencedFiles += 1;
      staleUnreferencedFileBytes = addSafeInteger(staleUnreferencedFileBytes, file.size);
    }
  }

  const reconciliation = {
    referencedAndPresent,
    referencedButMissing,
    activeReferencesMissing: countMissing(params.references.activePaths, params.physical.files),
    archivedReferencesMissing: countMissing(params.references.archivedPaths, params.physical.files),
    cacheReferencesMissing: countMissing(params.references.cachePaths, params.physical.files),
    unreferencedFiles,
    unreferencedFileBytes,
    staleUnreferencedFiles,
    staleUnreferencedFileBytes,
  };
  const filesystem = params.physical.stats;
  const database = params.references.stats;
  const reviewRequired = (
    reconciliation.referencedButMissing > 0
    || reconciliation.unreferencedFiles > 0
    || database.invalidReferenceRows > 0
    || database.multiplyReferencedPaths > 0
    || database.cacheOnlyPaths > 0
    || filesystem.symbolicLinks > 0
    || filesystem.specialEntries > 0
    || filesystem.unsupportedExtensionFiles > 0
    || filesystem.invalidSizeFiles > 0
    || filesystem.inspectionErrors > 0
    || filesystem.depthLimitExceeded > 0
    || filesystem.staleTemporaryUploadFiles > 0
  );

  return {
    schemaVersion: 1,
    mode: "read-only",
    generatedAt: new Date(now).toISOString(),
    staleAfterDays: Math.max(1, Math.round(staleAfterMs / (24 * 60 * 60 * 1000))),
    status: !filesystem.directoryPresent
      ? "storage-unavailable"
      : reviewRequired
        ? "review-required"
        : "clean",
    database,
    filesystem,
    reconciliation,
    writesPerformed: 0,
  };
}

export async function auditCollectionReceiptStorage(params: {
  execute: ExecuteCollectionReceiptStorageAuditQuery;
  receiptDir?: string;
  uploadsRootDir?: string;
  now?: number;
  staleAfterMs?: number;
  maxReferenceRows?: number;
  maxFilesystemEntries?: number;
  maxDirectoryDepth?: number;
}): Promise<CollectionReceiptStorageAuditReport> {
  const [references, physical] = await Promise.all([
    collectCollectionReceiptReferenceInventory({
      execute: params.execute,
      ...(params.maxReferenceRows === undefined
        ? {}
        : { maxReferenceRows: params.maxReferenceRows }),
    }),
    scanCollectionReceiptPhysicalInventory({
      ...(params.receiptDir === undefined ? {} : { receiptDir: params.receiptDir }),
      ...(params.uploadsRootDir === undefined
        ? {}
        : { uploadsRootDir: params.uploadsRootDir }),
      ...(params.now === undefined ? {} : { now: params.now }),
      ...(params.maxFilesystemEntries === undefined
        ? {}
        : { maxFilesystemEntries: params.maxFilesystemEntries }),
      ...(params.maxDirectoryDepth === undefined
        ? {}
        : { maxDirectoryDepth: params.maxDirectoryDepth }),
    }),
  ]);
  return reconcileCollectionReceiptStorage({
    references,
    physical,
    ...(params.now === undefined ? {} : { now: params.now }),
    ...(params.staleAfterMs === undefined ? {} : { staleAfterMs: params.staleAfterMs }),
  });
}
