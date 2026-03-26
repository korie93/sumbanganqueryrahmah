import assert from "node:assert/strict";
import test from "node:test";
import type { DataRow, Import } from "../../../shared/schema-postgres";
import { createImportsController } from "../../controllers/imports.controller";
import { errorHandler } from "../../middleware/error-handler";
import type { ImportWithRowCount, ImportsRepository } from "../../repositories/imports.repository";
import type { ImportAnalysisService } from "../../services/import-analysis.service";
import { ImportsService } from "../../services/imports.service";
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

function applyImportColumnFilters(
  rows: DataRow[],
  filters?: Array<{ column: string; operator: string; value: string }>,
) {
  const safeFilters = Array.isArray(filters) ? filters : [];
  if (safeFilters.length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    safeFilters.every((filter) => {
      const record = (row.jsonDataJsonb ?? {}) as Record<string, unknown>;
      const cellValue = String(record[filter.column] ?? "").toLowerCase();
      const filterValue = String(filter.value ?? "").toLowerCase();

      switch (filter.operator) {
        case "contains":
          return cellValue.includes(filterValue);
        case "equals":
          return cellValue === filterValue;
        case "startsWith":
          return cellValue.startsWith(filterValue);
        case "endsWith":
          return cellValue.endsWith(filterValue);
        case "notEquals":
          return cellValue !== filterValue;
        default:
          return true;
      }
    }),
  );
}

function createImportsRouteHarness(options?: {
  viewerRowsPerPage?: number;
  isDbProtected?: boolean;
  seedImportRows?: DataRow[];
  analysisDelayMs?: number;
  analysisAllDelayMs?: number;
  analysisRequestTimeoutMs?: number;
}) {
  const auditLogs: AuditEntry[] = [];
  const searchCalls: Array<Record<string, unknown>> = [];
  const createImportCalls: Array<Record<string, unknown>> = [];
  const createDataRowCalls: Array<Record<string, unknown>> = [];
  const renameCalls: Array<{ id: string; name: string }> = [];
  const deleteCalls: string[] = [];
  const analyzeImportCalls: string[] = [];
  const analyzeAllCalls: string[][] = [];
  const listImportsPageCalls: Array<Record<string, unknown>> = [];
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const importRecords = new Map<string, Import>();
  const seedImport: Import = {
    id: "import-1",
    name: "Customer Import",
    filename: "customers.xlsx",
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    isDeleted: false,
    createdBy: "admin.user",
  };
  const secondImport: Import = {
    id: "import-2",
    name: "March Batch",
    filename: "march.xlsx",
    createdAt: new Date("2026-03-09T00:00:00.000Z"),
    isDeleted: false,
    createdBy: "admin.user",
  };
  const thirdImport: Import = {
    id: "import-3",
    name: "Archive Batch",
    filename: "archive.csv",
    createdAt: new Date("2026-03-08T00:00:00.000Z"),
    isDeleted: false,
    createdBy: "admin.user",
  };
  importRecords.set(seedImport.id, seedImport);
  importRecords.set(secondImport.id, secondImport);
  importRecords.set(thirdImport.id, thirdImport);

  const seedImportRows = options?.seedImportRows ?? [
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
  ];

  const importRowCounts = new Map<string, number>([
    [seedImport.id, seedImportRows.length],
    [secondImport.id, 1],
    [thirdImport.id, 0],
  ]);
  const dataRowsByImport = new Map<string, DataRow[]>([
    [seedImport.id, seedImportRows],
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

  const listImportsWithCursor = (params: {
    cursor?: string | null;
    limit?: number;
    search?: string | null;
    createdOn?: string | null;
  }) => {
    listImportsPageCalls.push(params);
    const search = String(params.search || "").trim().toLowerCase();
    const createdOn = String(params.createdOn || "").trim();
    const limit = Math.max(1, Math.min(200, Number(params.limit || 100)));
    const filtered = listImportsWithCounts().filter((item) => {
      const matchesSearch = !search
        || item.name.toLowerCase().includes(search)
        || item.filename.toLowerCase().includes(search);
      const matchesDate = !createdOn || formatImportCreatedOn(item.createdAt) === createdOn;
      return matchesSearch && matchesDate;
    });
    const cursor = String(params.cursor || "").trim();
    const startIndex = cursor
      ? Math.max(0, filtered.findIndex((item) => item.id === cursor) + 1)
      : 0;
    const items = filtered.slice(startIndex, startIndex + limit);
    const nextItem = filtered[startIndex + limit];
    return {
      items,
      nextCursor: nextItem ? nextItem.id : null,
      total: filtered.length,
      limit,
    };
  };

  const storage = {
    searchDataRows: async (params: {
      importId: string;
      search?: string | null;
      limit: number;
      offset: number;
      columnFilters?: Array<{ column: string; operator: string; value: string }>;
      cursor?: string | null;
    }) => {
      searchCalls.push(params);
      const rows = applyImportColumnFilters(
        dataRowsByImport.get(params.importId) ?? [],
        params.columnFilters,
      );
      const cursor = String(params.cursor || "").trim();
      const pageRows = cursor
        ? rows.filter((row) => String(row.id) > cursor).slice(0, params.limit + 1)
        : rows.slice(params.offset, params.offset + params.limit + 1);
      const hasMore = pageRows.length > params.limit;
      const items = hasMore ? pageRows.slice(0, params.limit) : pageRows;
      return {
        rows: items,
        total: rows.length,
        nextCursorRowId: hasMore ? String(items[items.length - 1]?.id || "") || null : null,
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
    listImportsWithRowCountsPage: async (params: {
      cursor?: string | null;
      limit?: number;
      search?: string | null;
      createdOn?: string | null;
    }) => listImportsWithCursor(params),
  } as unknown as ImportsRepository;

  const importAnalysisService = {
    analyzeImport: async (importRecord: { id: string; name: string; filename: string }) => {
      const analysisDelayMs = options?.analysisDelayMs ?? 0;
      if (analysisDelayMs > 0) {
        await sleep(analysisDelayMs);
      }
      analyzeImportCalls.push(importRecord.id);
      return createAnalysisPayload(importRecord, importRowCounts.get(importRecord.id) ?? 0);
    },
    analyzeAll: async (imports: ImportWithRowCount[]) => {
      const analysisAllDelayMs = options?.analysisAllDelayMs ?? 0;
      if (analysisAllDelayMs > 0) {
        await sleep(analysisAllDelayMs);
      }
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
    importsController: createImportsController({
      importsService: new ImportsService(storage, importsRepository, importAnalysisService),
      getRuntimeSettingsCached: async () => ({
        viewerRowsPerPage: options?.viewerRowsPerPage ?? 100,
      }),
      isDbProtected: () => options?.isDbProtected ?? false,
      analysisRequestTimeoutMs: options?.analysisRequestTimeoutMs,
    }),
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
    searchRateLimiter: (_req, _res, next) => next(),
  });
  app.use(errorHandler);

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
    listImportsPageCalls,
  };
}

function formatImportCreatedOn(createdAt: Date | string | null | undefined) {
  if (createdAt instanceof Date && !Number.isNaN(createdAt.getTime())) {
    return createdAt.toISOString().slice(0, 10);
  }

  if (typeof createdAt === "string" && createdAt.trim()) {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return "";
}

test("GET /api/imports returns imports with row counts", async () => {
  const { app, listImportsPageCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.imports.length, 3);
    assert.equal(payload.imports[0].id, "import-1");
    assert.equal(payload.imports[0].rowCount, 2);
    assert.deepEqual(payload.pagination, {
      limit: 100,
      nextCursor: null,
      hasMore: false,
      total: 3,
    });
    assert.deepEqual(listImportsPageCalls, [{
      cursor: null,
      limit: 100,
      search: null,
      createdOn: null,
    }]);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports forwards cursor search and date filters", async () => {
  const { app, listImportsPageCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(
      `${baseUrl}/api/imports?limit=1&cursor=import-1&search=batch&createdOn=2026-03-09`,
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.imports.length, 1);
    assert.equal(payload.imports[0].id, "import-2");
    assert.deepEqual(payload.pagination, {
      limit: 1,
      nextCursor: null,
      hasMore: false,
      total: 1,
    });
    assert.deepEqual(listImportsPageCalls, [{
      cursor: "import-1",
      limit: 1,
      search: "batch",
      createdOn: "2026-03-09",
    }]);
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
      ok: false,
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
      columnFilters: [],
      cursor: null,
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
      ok: false,
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
    assert.equal(payload.totalImports, 3);
    assert.equal(payload.totalRows, 3);
    assert.deepEqual(analyzeAllCalls, [["import-1", "import-2", "import-3"]]);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports/:id/analyze returns 504 when analysis exceeds the request deadline", async () => {
  const { app } = createImportsRouteHarness({
    analysisRequestTimeoutMs: 15,
    analysisDelayMs: 50,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-1/analyze`);
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Import analysis is taking longer than expected. Please retry in a moment.",
      error: {
        code: "REQUEST_TIMEOUT",
        message: "Import analysis is taking longer than expected. Please retry in a moment.",
        details: {
          operation: "import-analysis",
          timeoutMs: 15,
        },
      },
    });
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports/:id/data applies dataset-wide column filters", async () => {
  const { app, searchCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const filters = encodeURIComponent(JSON.stringify([
      { column: "name", operator: "equals", value: "Bob" },
    ]));
    const response = await fetch(`${baseUrl}/api/imports/import-1/data?page=1&limit=20&columnFilters=${filters}`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.total, 1);
    assert.equal(payload.rows.length, 1);
    assert.equal(payload.rows[0]?.jsonDataJsonb?.name, "Bob");
    assert.deepEqual(searchCalls[0], {
      importId: "import-1",
      search: null,
      limit: 20,
      offset: 0,
      columnFilters: [
        { column: "name", operator: "equals", value: "Bob" },
      ],
      cursor: null,
    });
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports/:id/data returns cursor tokens for large datasets", async () => {
  const { app, searchCalls } = createImportsRouteHarness({
    seedImportRows: Array.from({ length: 11 }, (_, index) => ({
      id: `row-${String(index + 1).padStart(2, "0")}`,
      importId: "import-1",
      jsonDataJsonb: { name: `Customer ${index + 1}`, age: 20 + index },
    })),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const firstResponse = await fetch(`${baseUrl}/api/imports/import-1/data?page=1&limit=10`);
    assert.equal(firstResponse.status, 200);

    const firstPayload = await firstResponse.json();
    assert.equal(firstPayload.page, 1);
    assert.equal(firstPayload.rows.length, 10);
    assert.equal(firstPayload.rows[0]?.jsonDataJsonb?.name, "Customer 1");
    assert.equal(typeof firstPayload.nextCursor, "string");

    const secondResponse = await fetch(
      `${baseUrl}/api/imports/import-1/data?page=2&limit=10&cursor=${encodeURIComponent(String(firstPayload.nextCursor || ""))}`,
    );
    assert.equal(secondResponse.status, 200);

    const secondPayload = await secondResponse.json();
    assert.equal(secondPayload.page, 2);
    assert.equal(secondPayload.rows.length, 1);
    assert.equal(secondPayload.rows[0]?.jsonDataJsonb?.name, "Customer 11");
    assert.equal(secondPayload.nextCursor, null);
    assert.deepEqual(searchCalls, [
      {
        importId: "import-1",
        search: null,
        limit: 10,
        offset: 0,
        columnFilters: [],
        cursor: null,
      },
      {
        importId: "import-1",
        search: null,
        limit: 10,
        offset: 0,
        columnFilters: [],
        cursor: "row-10",
      },
    ]);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports/:id/data rejects malformed cursor tokens", async () => {
  const { app } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-1/data?page=2&cursor=bad-cursor`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Invalid import data cursor.",
    });
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports/:id/data rejects malformed column filters", async () => {
  const { app } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-1/data?page=1&columnFilters=%7Bbad-json`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Invalid viewer column filters.",
    });
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
