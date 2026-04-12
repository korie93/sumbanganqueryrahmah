import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { ImportsServiceMutationOperations } from "../imports-service-mutation-operations";
import type { ImportsServiceStorage } from "../imports-service-types";

function createStorageStub(overrides?: Partial<ImportsServiceStorage>): ImportsServiceStorage {
  const auditLogs: Array<Record<string, unknown>> = [];
  const imports = new Map<string, { id: string; name: string; filename: string; createdBy: string | null }>();

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
    createDataRow: async (data) => ({
      id: `row-${Math.random().toString(16).slice(2)}`,
      importId: data.importId,
      jsonDataJsonb: data.jsonDataJsonb,
    }),
    createImport: async (data) => {
      const created = {
        id: `import-${imports.size + 1}`,
        name: data.name,
        filename: data.filename,
        createdBy: data.createdBy ?? null,
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
      createDataRow: async (data) => {
        createdRows.push(data.jsonDataJsonb as Record<string, unknown>);
        return {
          id: `row-${createdRows.length}`,
          importId: data.importId,
          jsonDataJsonb: data.jsonDataJsonb,
        };
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

test("createImportFromCsvFile cleans up staged imports when row insertion fails mid-stream", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-import-mutation-"));
  const filePath = path.join(tempDir, "broken.csv");
  const deletedImportIds: string[] = [];
  const deletedRowImportIds: string[] = [];
  let createDataRowCalls = 0;

  try {
    await writeFile(filePath, "name,amount\nAlice,10\nBob,20\n", "utf8");
    const operations = new ImportsServiceMutationOperations(createStorageStub({
      createDataRow: async (data) => {
        createDataRowCalls += 1;
        if (createDataRowCalls === 2) {
          throw new Error("insert failed");
        }

        return {
          id: `row-${createDataRowCalls}`,
          importId: data.importId,
          jsonDataJsonb: data.jsonDataJsonb,
        };
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

    assert.equal(createDataRowCalls, 2);
    assert.equal(deletedRowImportIds.length, 1);
    assert.equal(deletedImportIds.length, 1);
    assert.equal(deletedRowImportIds[0], deletedImportIds[0]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createImportFromCsvFile cleans up empty staged CSV imports", async () => {
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

    assert.equal(deletedRowImportIds.length, 1);
    assert.equal(deletedImportIds.length, 1);
    assert.equal(deletedRowImportIds[0], deletedImportIds[0]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
