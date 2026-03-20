import assert from "node:assert/strict";
import test from "node:test";
import type { DataRow, Import } from "../../../shared/schema-postgres";
import type { ImportWithRowCount, ImportsRepository } from "../../repositories/imports.repository";
import type { ImportAnalysisService } from "../../services/import-analysis.service";
import { registerImportRoutes } from "../imports.routes";
import type { PostgresStorage } from "../../storage-postgres";
import {
  allowAllTabs,
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type AuditEntry = {
  action: string;
  performedBy?: string;
  targetResource?: string;
  details?: string;
};

function createAnalysisPayload(importRecord: { id: string; name: string; filename: string }, totalRows = 2) {
  return {
    import: {
      id: importRecord.id,
      name: importRecord.name,
      filename: importRecord.filename,
    },
    totalRows,
    analysis: {
      icLelaki: { count: 0, samples: [] },
      icPerempuan: { count: 0, samples: [] },
      noPolis: { count: 0, samples: [] },
      noTentera: { count: 0, samples: [] },
      passportMY: { count: 0, samples: [] },
      passportLuarNegara: { count: 0, samples: [] },
      duplicates: { count: 0, items: [] },
    },
  };
}

function createImportsRouteHarness(options?: {
  viewerRowsPerPage?: number;
  isDbProtected?: boolean;
}) {
  const auditLogs: AuditEntry[] = [];
  const searchCalls: Array<Record<string, unknown>> = [];
  const createImportCalls: Array<Record<string, unknown>> = [];
  const createDataRowCalls: Array<Record<string, unknown>> = [];
  const renameCalls: Array<{ id: string; name: string }> = [];
  const deleteCalls: string[] = [];
  const analyzeImportCalls: string[] = [];
  const analyzeAllCalls: string[][] = [];

  const importRecords = new Map<string, Import>();
  const seedImport: Import = {
    id: "import-1",
    name: "Customer Import",
    filename: "customers.xlsx",
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    isDeleted: false,
    createdBy: "admin.user",
  };
  importRecords.set(seedImport.id, seedImport);

  const importRowCounts = new Map<string, number>([[seedImport.id, 2]]);
  const dataRowsByImport = new Map<string, DataRow[]>([
    [
      seedImport.id,
      [
        {
          id: "row-1",
          importId: seedImport.id,
          jsonDataJsonb: { name: "Alice", age: 31 },
        },
        {
          id: "row-2",
          importId: seedImport.id,
          jsonDataJsonb: { name: "Bob", age: 42 },
        },
      ],
    ],
  ]);

  const listImportsWithCounts = (): ImportWithRowCount[] =>
    Array.from(importRecords.values())
      .filter((record) => !record.isDeleted)
      .map((record) => ({
        ...record,
        rowCount: importRowCounts.get(record.id) ?? 0,
      }))
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return rightTime - leftTime;
      });

  const storage = {
    searchDataRows: async (params: {
      importId: string;
      search?: string | null;
      limit: number;
      offset: number;
    }) => {
      searchCalls.push(params);
      const rows = dataRowsByImport.get(params.importId) ?? [];
      return {
        rows: rows.slice(params.offset, params.offset + params.limit),
        total: rows.length,
      };
    },
    createImport: async (data: { name: string; filename: string; createdBy?: string }) => {
      createImportCalls.push(data);
      const created: Import = {
        id: `import-${importRecords.size + 1}`,
        name: data.name,
        filename: data.filename,
        createdAt: new Date("2026-03-19T00:00:00.000Z"),
        isDeleted: false,
        createdBy: data.createdBy ?? null,
      };
      importRecords.set(created.id, created);
      importRowCounts.set(created.id, 0);
      dataRowsByImport.set(created.id, []);
      return created;
    },
    createDataRow: async (data: { importId: string; jsonDataJsonb: Record<string, unknown> }) => {
      createDataRowCalls.push(data);
      const row: DataRow = {
        id: `row-created-${createDataRowCalls.length}`,
        importId: data.importId,
        jsonDataJsonb: data.jsonDataJsonb,
      };
      const existing = dataRowsByImport.get(data.importId) ?? [];
      existing.push(row);
      dataRowsByImport.set(data.importId, existing);
      importRowCounts.set(data.importId, existing.length);
      return row;
    },
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
    getImportById: async (id: string) => {
      const record = importRecords.get(id);
      return record && !record.isDeleted ? record : undefined;
    },
    getDataRowsByImport: async (importId: string) => dataRowsByImport.get(importId) ?? [],
    updateImportName: async (id: string, name: string) => {
      renameCalls.push({ id, name });
      const record = importRecords.get(id);
      if (!record || record.isDeleted) {
        return undefined;
      }
      const updated: Import = {
        ...record,
        name,
      };
      importRecords.set(id, updated);
      return updated;
    },
    deleteImport: async (id: string) => {
      deleteCalls.push(id);
      const record = importRecords.get(id);
      if (!record || record.isDeleted) {
        return false;
      }
      importRecords.set(id, {
        ...record,
        isDeleted: true,
      });
      return true;
    },
  } as unknown as PostgresStorage;

  const importsRepository = {
    getImportsWithRowCounts: async () => listImportsWithCounts(),
  } as unknown as ImportsRepository;

  const importAnalysisService = {
    analyzeImport: async (importRecord: { id: string; name: string; filename: string }) => {
      analyzeImportCalls.push(importRecord.id);
      return createAnalysisPayload(importRecord, importRowCounts.get(importRecord.id) ?? 0);
    },
    analyzeAll: async (imports: ImportWithRowCount[]) => {
      analyzeAllCalls.push(imports.map((item) => item.id));
      const totalRows = imports.reduce((sum, item) => sum + Number(item.rowCount || 0), 0);
      return {
        totalImports: imports.length,
        totalRows,
        imports: imports.map((item) => ({
          id: item.id,
          name: item.name,
          filename: item.filename,
          rowCount: item.rowCount,
        })),
        analysis: createAnalysisPayload({
          id: "all-imports",
          name: "All Imports",
          filename: "all",
        }, totalRows).analysis,
      };
    },
  } as unknown as ImportAnalysisService;

  const app = createJsonTestApp();
  registerImportRoutes(app, {
    storage,
    importsRepository,
    importAnalysisService,
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
    searchRateLimiter: (_req, _res, next) => next(),
    getRuntimeSettingsCached: async () => ({
      viewerRowsPerPage: options?.viewerRowsPerPage ?? 100,
    }),
    isDbProtected: () => options?.isDbProtected ?? false,
  });

  return {
    app,
    auditLogs,
    searchCalls,
    createImportCalls,
    createDataRowCalls,
    renameCalls,
    deleteCalls,
    analyzeImportCalls,
    analyzeAllCalls,
  };
}

test("GET /api/imports returns imports with row counts", async () => {
  const { app } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.imports.length, 1);
    assert.equal(payload.imports[0].id, "import-1");
    assert.equal(payload.imports[0].rowCount, 2);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/imports rejects requests without data rows", async () => {
  const { app, createImportCalls, createDataRowCalls, auditLogs } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Empty",
        filename: "empty.xlsx",
        data: [],
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      message: "No data rows provided",
    });
    assert.equal(createImportCalls.length, 0);
    assert.equal(createDataRowCalls.length, 0);
    assert.equal(auditLogs.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/imports creates an import, writes rows, and audits the import", async () => {
  const { app, createImportCalls, createDataRowCalls, auditLogs } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      customer: `Customer ${index + 1}`,
      amount: index + 1,
    }));
    const response = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "March Import",
        filename: "march.csv",
        data: rows,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, "March Import");
    assert.equal(payload.filename, "march.csv");
    assert.equal(createImportCalls.length, 1);
    assert.equal(createImportCalls[0].createdBy, "admin.user");
    assert.equal(createDataRowCalls.length, 25);
    assert.deepEqual(createDataRowCalls[0].jsonDataJsonb, {
      customer: "Customer 1",
      amount: 1,
    });
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "IMPORT_DATA");
    assert.match(String(auditLogs[0].details), /Imported 25 rows from march\.csv/);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports/:id returns the import details with rows", async () => {
  const { app } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-1`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.import.id, "import-1");
    assert.equal(payload.rows.length, 2);
    assert.equal(payload.rows[0].jsonDataJsonb.name, "Alice");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports/:id/data applies the protected page-size cap and forwards search params", async () => {
  const { app, searchCalls } = createImportsRouteHarness({
    viewerRowsPerPage: 300,
    isDbProtected: true,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-1/data?page=2&limit=400&search=Alice`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.page, 2);
    assert.equal(payload.limit, 120);
    assert.equal(payload.total, 2);
    assert.equal(searchCalls.length, 1);
    assert.deepEqual(searchCalls[0], {
      importId: "import-1",
      search: "Alice",
      limit: 120,
      offset: 120,
    });
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports/:id/analyze returns a 404 for missing imports", async () => {
  const { app, analyzeImportCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/missing-import/analyze`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      message: "Import not found",
    });
    assert.equal(analyzeImportCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/analyze/all analyzes all imports through the service layer", async () => {
  const { app, analyzeAllCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/analyze/all`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.totalImports, 1);
    assert.equal(payload.totalRows, 2);
    assert.deepEqual(analyzeAllCalls, [["import-1"]]);
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/imports/:id/rename renames an import and writes an audit log", async () => {
  const { app, renameCalls, auditLogs } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-1/rename`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Renamed Import",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, "Renamed Import");
    assert.deepEqual(renameCalls, [{
      id: "import-1",
      name: "Renamed Import",
    }]);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "UPDATE_IMPORT");
    assert.equal(auditLogs[0].performedBy, "admin.user");
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/imports/:id deletes an import and audits the deletion", async () => {
  const { app, deleteCalls, auditLogs } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-1`, {
      method: "DELETE",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
    });
    assert.deepEqual(deleteCalls, ["import-1"]);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "DELETE_IMPORT");
    assert.equal(auditLogs[0].targetResource, "Customer Import");
  } finally {
    await stopTestServer(server);
  }
});
