import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { ImportsServiceMutationOperations } from "../imports-service-mutation-operations";
import type { ImportsServiceStorage } from "../imports-service-types";
import { DuplicateImportError, ImportJobCancelledError } from "../import-operation-errors";
import { runtimeConfig } from "../../config/runtime";

function createStorageStub(overrides?: Partial<ImportsServiceStorage>): ImportsServiceStorage {
  const auditLogs: Array<Record<string, unknown>> = [];
  const imports = new Map<string, {
    id: string;
    name: string;
    filename: string;
    createdBy: string | null;
    contentHashSha256: string | null;
    sourceSizeBytes: number | null;
  }>();
  let createdRowCount = 0;

  const baseStorage: ImportsServiceStorage = {
    createAuditLog: async (entry) => {
      auditLogs.push(entry);
      return {
        id: `audit-${auditLogs.length}`,
        action: entry.action,
        performedBy: entry.performedBy,
        details: entry.details ?? null,
        requestId: entry.requestId ?? null,
        targetUser: entry.targetUser ?? null,
        targetResource: entry.targetResource ?? null,
        timestamp: new Date("2026-04-12T00:00:00.000Z"),
      };
    },
    createDataRows: async (rows) => rows.map((data) => {
      createdRowCount += 1;
      return {
        id: `row-${createdRowCount}`,
        importId: data.importId,
        jsonDataJsonb: data.jsonDataJsonb,
      };
    }),
    createImport: async (data) => {
      const created = {
        id: `import-${imports.size + 1}`,
        name: data.name,
        filename: data.filename,
        createdBy: data.createdBy ?? null,
        contentHashSha256: data.contentHashSha256 ?? null,
        sourceSizeBytes: data.sourceSizeBytes ?? null,
      };
      imports.set(created.id, created);
      return {
        ...created,
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        isDeleted: false,
      };
    },
    deleteDataRowsByImport: async () => 0,
    deleteImport: async () => true,
    getDataRowsByImport: async () => [],
    getImportById: async (id) => {
      const found = imports.get(id);
      return found
        ? {
            ...found,
            createdAt: new Date("2026-04-12T00:00:00.000Z"),
            isDeleted: false,
          }
        : undefined;
    },
    findActiveImportByContentHash: async (createdBy, contentHashSha256) => {
      const found = [...imports.values()].find(
        (entry) =>
          entry.createdBy === createdBy
          && entry.contentHashSha256 === contentHashSha256,
      );
      return found
        ? {
            ...found,
            createdAt: new Date("2026-04-12T00:00:00.000Z"),
            isDeleted: false,
          }
        : undefined;
    },
    searchDataRows: async () => ({ rows: [], total: 0, nextCursorRowId: null }),
    updateImportName: async () => undefined,
    ...(overrides ?? {}),
  };

  return baseStorage;
}

test("createImportFromCsvFile streams rows and records the inspected row count in the audit log", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-mutation-"));
  const filePath = path.join(tempDir, "streamed.csv");
  const createdRows: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const deletedImportIds: string[] = [];
  const deletedRowImportIds: string[] = [];

  try {
    await writeFile(filePath, "name,amount\nAlice,10\nBob,20\n", "utf8");
    const operations = new ImportsServiceMutationOperations(createStorageStub({
      createAuditLog: async (entry) => {
        auditLogs.push(entry);
        return {
          id: `audit-${auditLogs.length}`,
          action: entry.action,
          performedBy: entry.performedBy,
          details: entry.details ?? null,
          requestId: entry.requestId ?? null,
          targetUser: entry.targetUser ?? null,
          targetResource: entry.targetResource ?? null,
          timestamp: new Date("2026-04-12T00:00:00.000Z"),
        };
      },
      createDataRows: async (rows) => {
        createdRows.push(...rows.map((data) => data.jsonDataJsonb as Record<string, unknown>));
        return rows.map((data, index) => ({
          id: `row-${createdRows.length - rows.length + index + 1}`,
          importId: data.importId,
          jsonDataJsonb: data.jsonDataJsonb,
        }));
      },
      deleteDataRowsByImport: async (importId) => {
        deletedRowImportIds.push(importId);
        return 0;
      },
      deleteImport: async (importId) => {
        deletedImportIds.push(importId);
        return true;
      },
    }));

    const created = await operations.createImportFromCsvFile({
      name: "April Import",
      filename: "streamed.csv",
      filePath,
      createdBy: "superuser",
    });

    assert.equal(created.name, "April Import");
    assert.equal(created.rowCount, 2);
    assert.deepEqual(createdRows, [
      { amount: "10", name: "Alice" },
      { amount: "20", name: "Bob" },
    ]);
    assert.equal(auditLogs.length, 1);
    assert.match(String(auditLogs[0]?.details), /Imported 2 rows from streamed\.csv/);
    assert.deepEqual(deletedImportIds, []);
    assert.deepEqual(deletedRowImportIds, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createImportFromCsvFile flushes streamed rows in configurable bounded batches", async () => {
  const originalBatchSize = runtimeConfig.runtime.importInsertBatchSize;
  runtimeConfig.runtime.importInsertBatchSize = 3;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-mutation-"));
  const filePath = path.join(tempDir, "batched.csv");
  let createdRowCount = 0;
  const batchSizes: number[] = [];

  try {
    await writeFile(
      filePath,
      [
        "name,amount",
        "A,1",
        "B,2",
        "C,3",
        "D,4",
        "E,5",
        "F,6",
        "G,7",
      ].join("\n"),
      "utf8",
    );

    const operations = new ImportsServiceMutationOperations(createStorageStub({
      createDataRows: async (rows) => {
        batchSizes.push(rows.length);
        await new Promise((resolve) => setImmediate(resolve));
        return rows.map((data) => {
          createdRowCount += 1;
          return {
            id: `row-${createdRowCount}`,
            importId: data.importId,
            jsonDataJsonb: data.jsonDataJsonb,
          };
        });
      },
    }));

    await operations.createImportFromCsvFile({
      name: "Batched Import",
      filename: "batched.csv",
      filePath,
      createdBy: "superuser",
    });

    assert.equal(createdRowCount, 7);
    assert.deepEqual(batchSizes, [3, 3, 1]);
  } finally {
    runtimeConfig.runtime.importInsertBatchSize = originalBatchSize;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createImportFromCsvFile rejects oversized streamed rows and rolls back the staged import", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-mutation-"));
  const filePath = path.join(tempDir, "oversized-row.csv");
  const deletedImportIds: string[] = [];
  const deletedRowImportIds: string[] = [];
  const originalMaxCellLength = runtimeConfig.runtime.importMaxCellLength;
  runtimeConfig.runtime.importMaxCellLength = 100_000;

  try {
    await writeFile(filePath, `name,notes\nAlice,${"x".repeat(70 * 1024)}\n`, "utf8");
    const operations = new ImportsServiceMutationOperations(createStorageStub({
      deleteDataRowsByImport: async (importId) => {
        deletedRowImportIds.push(importId);
        return 0;
      },
      deleteImport: async (importId) => {
        deletedImportIds.push(importId);
        return true;
      },
    }));

    await assert.rejects(
      () =>
        operations.createImportFromCsvFile({
          name: "Oversized Row Import",
          filename: "oversized-row.csv",
          filePath,
          createdBy: "superuser",
        }),
      /Import row exceeds the configured/i,
    );

    assert.equal(deletedRowImportIds.length, 1);
    assert.equal(deletedImportIds.length, 1);
    assert.equal(deletedRowImportIds[0], deletedImportIds[0]);
  } finally {
    runtimeConfig.runtime.importMaxCellLength = originalMaxCellLength;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createImportFromCsvFile cleans up staged imports when row insertion fails mid-stream", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-mutation-"));
  const filePath = path.join(tempDir, "broken.csv");
  const deletedImportIds: string[] = [];
  const deletedRowImportIds: string[] = [];
  let createDataRowsCalls = 0;
  const originalBatchSize = runtimeConfig.runtime.importInsertBatchSize;
  runtimeConfig.runtime.importInsertBatchSize = 1;

  try {
    await writeFile(filePath, "name,amount\nAlice,10\nBob,20\n", "utf8");
    const operations = new ImportsServiceMutationOperations(createStorageStub({
      createDataRows: async (rows) => {
        createDataRowsCalls += 1;
        if (createDataRowsCalls === 2) {
          throw new Error("insert failed");
        }

        return rows.map((data) => ({
          id: `row-${createDataRowsCalls}`,
          importId: data.importId,
          jsonDataJsonb: data.jsonDataJsonb,
        }));
      },
      deleteDataRowsByImport: async (importId) => {
        deletedRowImportIds.push(importId);
        return 1;
      },
      deleteImport: async (importId) => {
        deletedImportIds.push(importId);
        return true;
      },
    }));

    await assert.rejects(
      () =>
        operations.createImportFromCsvFile({
          name: "Broken Import",
          filename: "broken.csv",
          filePath,
          createdBy: "superuser",
        }),
      /insert failed/i,
    );

    assert.equal(createDataRowsCalls, 2);
    assert.equal(deletedRowImportIds.length, 1);
    assert.equal(deletedImportIds.length, 1);
    assert.equal(deletedRowImportIds[0], deletedImportIds[0]);
  } finally {
    runtimeConfig.runtime.importInsertBatchSize = originalBatchSize;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createImport writes legacy JSON rows with bounded multi-row inserts", async () => {
  const originalBatchSize = runtimeConfig.runtime.importInsertBatchSize;
  runtimeConfig.runtime.importInsertBatchSize = 2;
  const batchSizes: number[] = [];
  const storedRows: Array<Record<string, unknown>> = [];

  try {
    const operations = new ImportsServiceMutationOperations(createStorageStub({
      createDataRows: async (rows) => {
        batchSizes.push(rows.length);
        storedRows.push(...rows.map((row) => row.jsonDataJsonb as Record<string, unknown>));
        return rows.map((row, index) => ({
          id: `row-${storedRows.length - rows.length + index + 1}`,
          importId: row.importId,
          jsonDataJsonb: row.jsonDataJsonb,
        }));
      },
    }));

    const created = await operations.createImport({
      name: "Legacy JSON Import",
      filename: "legacy.json",
      dataRows: [
        { name: "Alice" },
        { name: "Bob" },
        { name: "Carol" },
      ],
      createdBy: "superuser",
    });

    assert.deepEqual(batchSizes, [2, 1]);
    assert.equal(created.rowCount, 3);
    assert.deepEqual(storedRows, [
      { name: "Alice" },
      { name: "Bob" },
      { name: "Carol" },
    ]);
  } finally {
    runtimeConfig.runtime.importInsertBatchSize = originalBatchSize;
  }
});

test("createImportFromCsvFile rejects empty CSV files before creating an import", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-mutation-"));
  const filePath = path.join(tempDir, "empty.csv");
  const deletedImportIds: string[] = [];
  const deletedRowImportIds: string[] = [];

  try {
    await writeFile(filePath, "name,amount\n", "utf8");
    const operations = new ImportsServiceMutationOperations(createStorageStub({
      deleteDataRowsByImport: async (importId) => {
        deletedRowImportIds.push(importId);
        return 0;
      },
      deleteImport: async (importId) => {
        deletedImportIds.push(importId);
        return true;
      },
    }));

    await assert.rejects(
      () =>
        operations.createImportFromCsvFile({
          name: "Empty Import",
          filename: "empty.csv",
          filePath,
          createdBy: "superuser",
        }),
      /No data rows provided/i,
    );

    assert.equal(deletedRowImportIds.length, 0);
    assert.equal(deletedImportIds.length, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createImport rolls back legacy JSON imports when a row exceeds the byte budget", async () => {
  const deletedImportIds: string[] = [];
  const deletedRowImportIds: string[] = [];
  const operations = new ImportsServiceMutationOperations(createStorageStub({
    deleteDataRowsByImport: async (importId) => {
      deletedRowImportIds.push(importId);
      return 0;
    },
    deleteImport: async (importId) => {
      deletedImportIds.push(importId);
      return true;
    },
  }));

  await assert.rejects(
    () =>
      operations.createImport({
        name: "Legacy JSON Import",
        filename: "legacy.json",
        dataRows: [{ name: "Alice", notes: "x".repeat(70 * 1024) }],
        createdBy: "superuser",
      }),
    /Import row exceeds the configured/i,
  );

  assert.equal(deletedRowImportIds.length, 1);
  assert.equal(deletedImportIds.length, 1);
  assert.equal(deletedRowImportIds[0], deletedImportIds[0]);
});

test("createImport rejects a duplicate content hash before creating database rows", async () => {
  let createImportCalls = 0;
  const existingImport = {
    id: "import-existing",
    name: "Existing Import",
    filename: "original.csv",
    createdAt: new Date("2026-04-12T00:00:00.000Z"),
    isDeleted: false,
    createdBy: "superuser",
    contentHashSha256: "a".repeat(64),
    sourceSizeBytes: 24,
  };
  const operations = new ImportsServiceMutationOperations(createStorageStub({
    createImport: async () => {
      createImportCalls += 1;
      return existingImport;
    },
    findActiveImportByContentHash: async () => existingImport,
  }));

  await assert.rejects(
    () => operations.createImport({
      name: "Renamed Duplicate",
      filename: "renamed.csv",
      dataRows: [{ name: "Alice" }],
      createdBy: "superuser",
      contentHashSha256: "a".repeat(64),
      sourceSizeBytes: 24,
    }),
    DuplicateImportError,
  );
  assert.equal(createImportCalls, 0);
});

test("createImport translates a concurrent hash uniqueness race into a duplicate result", async () => {
  let duplicateChecks = 0;
  const existingImport = {
    id: "import-race-winner",
    name: "Concurrent Import",
    filename: "winner.csv",
    createdAt: new Date("2026-04-12T00:00:00.000Z"),
    isDeleted: false,
    createdBy: "superuser",
    contentHashSha256: "b".repeat(64),
    sourceSizeBytes: 24,
  };
  const operations = new ImportsServiceMutationOperations(createStorageStub({
    createImport: async () => {
      throw Object.assign(new Error("unique violation"), { code: "23505" });
    },
    findActiveImportByContentHash: async () => {
      duplicateChecks += 1;
      return duplicateChecks === 1 ? undefined : existingImport;
    },
  }));

  await assert.rejects(
    () => operations.createImport({
      name: "Concurrent Loser",
      filename: "loser.csv",
      dataRows: [{ name: "Alice" }],
      createdBy: "superuser",
      contentHashSha256: "b".repeat(64),
      sourceSizeBytes: 24,
    }),
    DuplicateImportError,
  );
  assert.equal(duplicateChecks, 2);
});

test("createImportFromCsvFile applies column mapping before rows are stored", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-mapping-"));
  const filePath = path.join(tempDir, "mapped.csv");
  const storedRows: Array<Record<string, unknown>> = [];

  try {
    await writeFile(filePath, "Customer Name,Private Note,Amount\nAlice,secret,42\n", "utf8");
    const operations = new ImportsServiceMutationOperations(createStorageStub({
      createDataRows: async (rows) => {
        storedRows.push(...rows.map((row) => row.jsonDataJsonb as Record<string, unknown>));
        return rows.map((row, index) => ({
          id: `mapped-row-${index}`,
          importId: row.importId,
          jsonDataJsonb: row.jsonDataJsonb,
        }));
      },
    }));

    await operations.createImportFromCsvFile({
      name: "Mapped Import",
      filename: "mapped.csv",
      filePath,
      createdBy: "superuser",
      columnMapping: [
        { source: "Customer Name", target: "customer_name" },
        { source: "Private Note", target: null },
        { source: "Amount", target: "amount" },
      ],
    });

    assert.deepEqual(storedRows.map((row) => ({ ...row })), [{
      customer_name: "Alice",
      amount: "42",
    }]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createImportFromCsvFile rolls back partial rows when cancellation is requested", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-cancel-"));
  const filePath = path.join(tempDir, "cancel.csv");
  const deletedImportIds: string[] = [];
  const deletedRowImportIds: string[] = [];
  let cancellationChecks = 0;
  const originalBatchSize = runtimeConfig.runtime.importInsertBatchSize;
  runtimeConfig.runtime.importInsertBatchSize = 1;

  try {
    await writeFile(filePath, "name\nAlice\nBob\nCarol\n", "utf8");
    const operations = new ImportsServiceMutationOperations(createStorageStub({
      deleteDataRowsByImport: async (importId) => {
        deletedRowImportIds.push(importId);
        return 1;
      },
      deleteImport: async (importId) => {
        deletedImportIds.push(importId);
        return true;
      },
    }));

    await assert.rejects(
      () => operations.createImportFromCsvFile({
        name: "Cancelled Import",
        filename: "cancel.csv",
        filePath,
        createdBy: "superuser",
        shouldCancel: () => {
          cancellationChecks += 1;
          return cancellationChecks >= 2;
        },
      }),
      ImportJobCancelledError,
    );

    assert.equal(deletedRowImportIds.length, 1);
    assert.equal(deletedImportIds.length, 1);
    assert.equal(deletedRowImportIds[0], deletedImportIds[0]);
  } finally {
    runtimeConfig.runtime.importInsertBatchSize = originalBatchSize;
    await rm(tempDir, { recursive: true, force: true });
  }
});
