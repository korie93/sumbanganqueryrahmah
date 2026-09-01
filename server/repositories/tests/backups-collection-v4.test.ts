import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { mapBackupCollectionRecordRow } from "../backups-payload-collection-utils";
import {
  normalizeBackupCollectionOspTarget,
  normalizeBackupCollectionRecord,
  normalizeBackupCollectionSourceConfig,
  normalizeBackupCollectionSourceRow,
} from "../backups-restore-collection-normalize-utils";
import {
  restoreCollectionOspTargetsFromBackup,
  restoreCollectionSourceConfigsFromBackup,
  restoreCollectionSourceRowsFromBackup,
} from "../backups-restore-collection-governance-utils";
import { createRestoreStats } from "../backups-restore-stats-utils";
import type {
  BackupCollectionOspTarget,
  BackupCollectionRecord,
  BackupCollectionSourceConfig,
  BackupCollectionSourceRow,
} from "../backups-repository-types";
import type {
  BackupPayloadChunkReader,
  BackupRestoreExecutor,
} from "../backups-restore-shared-utils";

const ACCOUNT_HASH = "a".repeat(64);
const SOURCE_IMPORT_ID = "import-v4-1";

function buildScopeHash(sourceImportIds: string[]): string {
  const canonical = [...new Set(sourceImportIds)].sort().join("\n");
  return crypto.createHash("sha256")
    .update(`sqr-collection-osp-source-scope-v1:${canonical}`, "utf8")
    .digest("hex");
}

function flattenSqlChunk(chunk: unknown): string {
  if (chunk === null || chunk === undefined) return "";
  if (typeof chunk === "string") return chunk;
  if (Array.isArray(chunk)) return chunk.map(flattenSqlChunk).join("");
  if (typeof chunk === "object") {
    const value = (chunk as { value?: unknown }).value;
    if (value !== undefined) return flattenSqlChunk(value);
    const queryChunks = (chunk as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(queryChunks)) return queryChunks.map(flattenSqlChunk).join("");
  }
  return "";
}

function createDatasetReader(datasets: Record<string, unknown[]>): BackupPayloadChunkReader {
  return {
    async *iterateArrayChunks<T>(key: string, chunkSize: number): AsyncGenerator<T[]> {
      const rows = datasets[key] ?? [];
      for (let index = 0; index < rows.length; index += chunkSize) {
        yield rows.slice(index, index + chunkSize) as T[];
      }
    },
  };
}

function createBackupRecord(
  overrides: Partial<BackupCollectionRecord> = {},
): BackupCollectionRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    customerName: "Backup Customer",
    icNumber: "900101019999",
    customerPhone: "0123999999",
    accountNumber: "ACC-1001",
    cardNumberLast4: "4321",
    sourceImportId: SOURCE_IMPORT_ID,
    sourceDataRowId: "source-row-v4-1",
    sourceImportName: "NPL P10",
    sourceFilename: "npl-p10.xlsb",
    agingBucket: "D3",
    totalDue: "1000.00",
    billingPrincipalOsp: "800.00",
    callingDate: "2026-08-12",
    callingWindowEndExclusive: "2026-09-12",
    sourceMatchBasis: "account_number",
    sourceMatchAccuracy: 100,
    sourceObligationKey: `account:${ACCOUNT_HASH}`,
    settlementCycleKey: `2026-08-12:account:${ACCOUNT_HASH}`,
    classification: "abort_cp",
    cumulativeCollected: "1000.00",
    remainingAmount: "0.00",
    batch: "P10",
    paymentDate: "2026-08-30",
    amount: "1000.00",
    receiptFile: null,
    createdByLogin: "system",
    collectionStaffNickname: "Collector Alpha",
    createdAt: "2026-08-30T08:00:00.000Z",
    ...overrides,
  };
}

test("collection V4 backup mapper preserves authoritative settlement fields", () => {
  const mapped = mapBackupCollectionRecordRow({
    ...createBackupRecord(),
    cumulativeCollected: "1000.00",
    remainingAmount: "0.00",
  });

  assert.equal(mapped.cardNumberLast4, "4321");
  assert.equal(mapped.sourceMatchBasis, "account_number");
  assert.equal(mapped.sourceObligationKey, `account:${ACCOUNT_HASH}`);
  assert.equal(mapped.settlementCycleKey, `2026-08-12:account:${ACCOUNT_HASH}`);
  assert.equal(mapped.classification, "abort_cp");
  assert.equal(mapped.cumulativeCollected, "1000.00");
  assert.equal(mapped.remainingAmount, "0.00");
});

test("collection V4 restore preserves valid settlement state and remains compatible with old backups", () => {
  const restored = normalizeBackupCollectionRecord(createBackupRecord());
  assert.ok(restored);
  assert.equal(restored.cardNumberLast4, "4321");
  assert.equal(restored.sourceMatchBasis, "account_number");
  assert.equal(restored.classification, "abort_cp");
  assert.equal(restored.cumulativeCollected, 1000);
  assert.equal(restored.remainingAmount, 0);

  const legacyRecord = createBackupRecord();
  delete legacyRecord.cardNumberLast4;
  delete legacyRecord.sourceObligationKey;
  delete legacyRecord.settlementCycleKey;
  delete legacyRecord.classification;
  delete legacyRecord.cumulativeCollected;
  delete legacyRecord.remainingAmount;
  const legacy = normalizeBackupCollectionRecord(legacyRecord);
  assert.ok(legacy);
  assert.equal(legacy.cardNumberLast4, null);
  assert.equal(legacy.classification, null);
  assert.equal(legacy.cumulativeCollected, null);
  assert.equal(legacy.remainingAmount, null);
});

test("collection V4 restore drops inconsistent settlement classifications", () => {
  const restored = normalizeBackupCollectionRecord(createBackupRecord({
    settlementCycleKey: `2026-08-13:account:${ACCOUNT_HASH}`,
    classification: "abort_cp",
  }));

  assert.ok(restored);
  assert.equal(restored.sourceObligationKey, null);
  assert.equal(restored.settlementCycleKey, null);
  assert.equal(restored.classification, null);
  assert.equal(restored.cumulativeCollected, null);
  assert.equal(restored.remainingAmount, null);
});

test("collection source governance backup rows are validated fail-closed", () => {
  const sourceConfig = normalizeBackupCollectionSourceConfig({
    id: SOURCE_IMPORT_ID,
    validFrom: "2026-08-01",
    validTo: "2026-09-30",
    cycleKey: "2026-08",
    enabled: true,
    compatibilityStatus: "compatible",
    compatibilityIssues: [],
    indexedRowCount: 1,
    configuredBy: "superuser",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  assert.ok(sourceConfig);

  const sourceRow = normalizeBackupCollectionSourceRow({
    id: "source-row-v4-1",
    sourceImportId: SOURCE_IMPORT_ID,
    accountNumberHash: ACCOUNT_HASH,
    cardNumberHash: null,
    cardNumberLast4: "4321",
    canonicalObligationKey: `account:${ACCOUNT_HASH}`,
    totalDue: "1000.00",
    billingPrincipalOsp: "800.00",
    totalOsb: "1200.00",
    agingBucket: "D3",
    callingDate: "2026-08-12",
    createdAt: "2026-08-01T00:00:00.000Z",
  });
  assert.ok(sourceRow);
  assert.equal(sourceRow.totalDue, 1000);

  assert.equal(normalizeBackupCollectionSourceRow({
    id: "source-row-v4-1",
    sourceImportId: SOURCE_IMPORT_ID,
    accountNumberHash: ACCOUNT_HASH,
    canonicalObligationKey: `card:${ACCOUNT_HASH}`,
    totalDue: "1000.00",
    billingPrincipalOsp: "800.00",
    agingBucket: "D3",
    callingDate: "2026-08-12",
    createdAt: "2026-08-01T00:00:00.000Z",
  }), null);
});

test("collection OSP target restore verifies its canonical source scope hash", () => {
  const sourceImportIds = [SOURCE_IMPORT_ID];
  const target = normalizeBackupCollectionOspTarget({
    id: "22222222-2222-4222-8222-222222222222",
    sourceScopeHash: buildScopeHash(sourceImportIds),
    sourceImportIds,
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    agingBucket: "D3",
    totalOspBaseline: "1879275.07",
    targetPercentage: "33.0000",
    configuredBy: "superuser",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  assert.ok(target);
  assert.equal(target.targetPercentage, 33);

  assert.equal(normalizeBackupCollectionOspTarget({
    id: "22222222-2222-4222-8222-222222222222",
    sourceScopeHash: "0".repeat(64),
    sourceImportIds,
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    agingBucket: "D3",
    targetPercentage: "33.0000",
    configuredBy: "superuser",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }), null);
});

test("collection source governance restore writes optional V4 datasets in dependency order", async () => {
  const sourceConfig: BackupCollectionSourceConfig = {
    id: SOURCE_IMPORT_ID,
    validFrom: "2026-08-01",
    validTo: "2026-09-30",
    cycleKey: "2026-08",
    enabled: true,
    compatibilityStatus: "compatible",
    compatibilityIssues: [],
    indexedRowCount: 1,
    configuredBy: "superuser",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const sourceRow: BackupCollectionSourceRow = {
    id: "source-row-v4-1",
    sourceImportId: SOURCE_IMPORT_ID,
    accountNumberHash: ACCOUNT_HASH,
    canonicalObligationKey: `account:${ACCOUNT_HASH}`,
    totalDue: "1000.00",
    billingPrincipalOsp: "800.00",
    totalOsb: "1200.00",
    agingBucket: "D3",
    callingDate: "2026-08-12",
    createdAt: "2026-08-01T00:00:00.000Z",
  };
  const sourceImportIds = [SOURCE_IMPORT_ID];
  const target: BackupCollectionOspTarget = {
    id: "22222222-2222-4222-8222-222222222222",
    sourceScopeHash: buildScopeHash(sourceImportIds),
    sourceImportIds,
    periodFrom: "2026-08-01",
    periodTo: "2026-08-31",
    agingBucket: "D3",
    totalOspBaseline: "800.00",
    targetPercentage: "33.0000",
    configuredBy: "superuser",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const reader = createDatasetReader({
    collectionSourceConfigs: [sourceConfig],
    collectionSourceRows: [sourceRow],
    collectionOspTargets: [target],
  });
  const executedQueries: string[] = [];
  const tx = {
    async execute(query: unknown) {
      const statement = flattenSqlChunk(query).replace(/\s+/g, " ").trim();
      executedQueries.push(statement);
      if (statement.includes("INSERT INTO public.collection_source_configs")) {
        return { rows: [{ source_import_id: SOURCE_IMPORT_ID }] };
      }
      if (statement.includes("INSERT INTO public.collection_source_rows")) {
        return { rows: [{ source_data_row_id: sourceRow.id }] };
      }
      if (statement.includes("INSERT INTO public.collection_osp_targets")) {
        return { rows: [{ id: target.id }] };
      }
      return { rows: [] };
    },
  } as unknown as BackupRestoreExecutor;
  const stats = createRestoreStats();

  await restoreCollectionSourceConfigsFromBackup(tx, reader, stats);
  await restoreCollectionSourceRowsFromBackup(tx, reader, stats);
  await restoreCollectionOspTargetsFromBackup(tx, reader, stats);

  assert.equal(stats.collectionSourceConfigs.inserted, 1);
  assert.equal(stats.collectionSourceRows.inserted, 1);
  assert.equal(stats.collectionOspTargets.inserted, 1);
  assert.ok(executedQueries.some((query) => query.includes("JOIN public.data_rows source_row")));
  assert.ok(executedQueries.some((query) => query.includes("UPDATE public.collection_source_configs config")));
  assert.ok(executedQueries.some((query) => query.includes("unnest(candidate.source_import_ids)")));
});
