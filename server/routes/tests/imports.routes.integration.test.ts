import assert from "node:assert/strict";
import test from "node:test";
import * as xlsx from "xlsx";
import type { DataRow, Import } from "../../../shared/schema-postgres";
import {
  allImportsAnalysisResponseSchema,
  deleteImportResponseSchema,
  importDataPageResponseSchema,
  importMutationResultSchema,
  importRecordSchema,
  importsListResponseSchema,
  singleImportAnalysisResponseSchema,
} from "../../../shared/api-contracts";
import { ERROR_CODES } from "../../../shared/error-codes";
import { runtimeConfig } from "../../config/runtime";
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

function expectApiError(message: string, code: string) {
  return {
    ok: false,
    message,
    code,
    error: {
      code,
      message,
    },
  };
}

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
      quality: {
        score: 0,
        grade: "no_data",
        completenessPercent: 0,
        typeConsistencyPercent: 0,
        profiledColumns: 0,
        columnsNeedingReview: 0,
        columnsWithMissingValues: 0,
        mixedTypeColumns: 0,
        limitedCardinalityColumns: 0,
        totalApplicableCells: 0,
        populatedCells: 0,
        emptyCells: 0,
        columnLimitReached: false,
      },
      columns: [],
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

function getImportHeaders(rows: DataRow[]) {
  const headerSet = new Set<string>();

  for (const row of rows) {
    const record = row.jsonDataJsonb;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      continue;
    }

    for (const key of Object.keys(record as Record<string, unknown>)) {
      const normalized = String(key || "").trim();
      if (normalized) {
        headerSet.add(normalized);
      }
    }
  }

  return Array.from(headerSet).sort((left, right) => left.localeCompare(right));
}

function createImportsRouteHarness(options?: {
  viewerRowsPerPage?: number;
  isDbProtected?: boolean;
  seedImportRows?: DataRow[];
  analysisDelayMs?: number;
  analysisAllDelayMs?: number;
  analysisRequestTimeoutMs?: number;
  multipartMaxFileSizeBytes?: number;
}) {
  const auditLogs: AuditEntry[] = [];
  const searchCalls: Array<Record<string, unknown>> = [];
  const createImportCalls: Array<Record<string, unknown>> = [];
  const createDataRowCalls: Array<Record<string, unknown>> = [];
  const createDataRowsBatchSizes: number[] = [];
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
  const mutationIdempotencyRows = new Map<string, {
    fingerprint: string | null;
    responseBody?: unknown;
    responseStatus?: number;
    state: "pending" | "completed";
  }>();
  const seedImport: Import = {
    id: "import-1",
    name: "Customer Import",
    filename: "customers.xlsx",
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
    lastOpenedAt: null,
    isDeleted: false,
    createdBy: "admin.user",
    contentHashSha256: null,
    sourceSizeBytes: null,
  };
  const secondImport: Import = {
    id: "import-2",
    name: "March Batch",
    filename: "march.xlsx",
    createdAt: new Date("2026-03-09T00:00:00.000Z"),
    lastOpenedAt: null,
    isDeleted: false,
    createdBy: "admin.user",
    contentHashSha256: null,
    sourceSizeBytes: null,
  };
  const thirdImport: Import = {
    id: "import-3",
    name: "Archive Batch",
    filename: "archive.csv",
    createdAt: new Date("2026-03-08T00:00:00.000Z"),
    lastOpenedAt: null,
    isDeleted: false,
    createdBy: "admin.user",
    contentHashSha256: null,
    sourceSizeBytes: null,
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
    pageSize?: number;
    search?: string | null;
    createdOn?: string | null;
  }) => {
    listImportsPageCalls.push(params);
    if (String(params.cursor || "").trim() === "bad-cursor") {
      throw new Error("Invalid imports cursor.");
    }
    const search = String(params.search || "").trim().toLowerCase();
    const createdOn = String(params.createdOn || "").trim();
    const limit = Math.max(1, Math.min(200, Number(params.pageSize ?? params.limit ?? 100)));
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

  const listImportsWithOffset = (params: {
    page?: number;
    pageSize?: number;
    search?: string | null;
    createdBy?: string | null;
    createdOn?: string | null;
    minRows?: number | null;
    maxRows?: number | null;
    view?: "all" | "recent" | "large" | "duplicates" | "review";
  }) => {
    listImportsPageCalls.push(params);
    const search = String(params.search || "").trim().toLowerCase();
    const createdBy = String(params.createdBy || "").trim().toLowerCase();
    const createdOn = String(params.createdOn || "").trim();
    const pageSize = Math.max(1, Math.min(100, Number(params.pageSize ?? 20)));
    const duplicateCounts = new Map<string, number>();
    for (const item of listImportsWithCounts()) {
      const hash = String(item.contentHashSha256 || "");
      if (hash) duplicateCounts.set(hash, (duplicateCounts.get(hash) ?? 0) + 1);
    }
    const filtered = listImportsWithCounts().filter((item) => {
      const uploader = String(item.createdBy || "").toLowerCase();
      const rows = Number(item.rowCount || 0);
      const matchesSearch = !search
        || item.name.toLowerCase().includes(search)
        || item.filename.toLowerCase().includes(search)
        || uploader.includes(search);
      const matchesUploader = !createdBy || uploader.includes(createdBy);
      const matchesDate = !createdOn || formatImportCreatedOn(item.createdAt) === createdOn;
      const matchesMinRows = params.minRows == null || rows >= params.minRows;
      const matchesMaxRows = params.maxRows == null || rows <= params.maxRows;
      const matchesView =
        !params.view
        || params.view === "all"
        || (params.view === "large" && (rows >= 10_000 || Number(item.sourceSizeBytes || 0) >= 10 * 1024 * 1024))
        || (params.view === "duplicates" && (duplicateCounts.get(String(item.contentHashSha256 || "")) ?? 0) > 1)
        || (params.view === "review" && rows === 0)
        || (params.view === "recent" && new Date(item.createdAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000);
      return matchesSearch && matchesUploader && matchesDate && matchesMinRows && matchesMaxRows && matchesView;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(Math.max(1, Number(params.page ?? 1)), totalPages);
    const offset = (page - 1) * pageSize;
    return {
      items: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      pageSize,
      totalPages,
      offset,
    };
  };

  const storage = {
    acquireMutationIdempotency: async (params: {
      scope: string;
      actor: string;
      idempotencyKey: string;
      requestFingerprint?: string | null;
    }) => {
      const key = `${params.scope}::${params.actor}::${params.idempotencyKey}`;
      const existing = mutationIdempotencyRows.get(key);
      if (!existing) {
        mutationIdempotencyRows.set(key, {
          fingerprint: params.requestFingerprint ?? null,
          state: "pending",
        });
        return { status: "acquired" as const };
      }
      if (
        params.requestFingerprint
        && existing.fingerprint
        && params.requestFingerprint !== existing.fingerprint
      ) {
        return { status: "payload_mismatch" as const };
      }
      if (existing.state === "completed" && existing.responseStatus) {
        return {
          status: "replay" as const,
          responseBody: existing.responseBody,
          responseStatus: existing.responseStatus,
        };
      }
      return { status: "in_progress" as const };
    },
    completeMutationIdempotency: async (params: {
      scope: string;
      actor: string;
      idempotencyKey: string;
      responseBody: unknown;
      responseStatus: number;
    }) => {
      const key = `${params.scope}::${params.actor}::${params.idempotencyKey}`;
      const existing = mutationIdempotencyRows.get(key);
      if (existing) {
        mutationIdempotencyRows.set(key, {
          ...existing,
          responseBody: params.responseBody,
          responseStatus: params.responseStatus,
          state: "completed",
        });
      }
    },
    releaseMutationIdempotency: async (params: {
      scope: string;
      actor: string;
      idempotencyKey: string;
    }) => {
      const key = `${params.scope}::${params.actor}::${params.idempotencyKey}`;
      if (mutationIdempotencyRows.get(key)?.state === "pending") {
        mutationIdempotencyRows.delete(key);
      }
    },
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
    createImport: async (data: {
      name: string;
      filename: string;
      createdBy?: string;
      contentHashSha256?: string;
      sourceSizeBytes?: number;
    }) => {
      createImportCalls.push(data);
      const created: Import = {
        id: `import-${importRecords.size + 1}`,
        name: data.name,
        filename: data.filename,
        createdAt: new Date("2026-03-19T00:00:00.000Z"),
        lastOpenedAt: null,
        isDeleted: false,
        createdBy: data.createdBy ?? null,
        contentHashSha256: data.contentHashSha256 ?? null,
        sourceSizeBytes: data.sourceSizeBytes ?? null,
      };
      importRecords.set(created.id, created);
      importRowCounts.set(created.id, 0);
      dataRowsByImport.set(created.id, []);
      return created;
    },
    findActiveImportByContentHash: async (
      createdBy: string,
      contentHashSha256: string,
    ) => [...importRecords.values()].find(
      (record) =>
        !record.isDeleted
        && record.createdBy === createdBy
        && record.contentHashSha256 === contentHashSha256,
    ),
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
    createDataRows: async (
      rows: Array<{ importId: string; jsonDataJsonb: Record<string, unknown> }>,
    ) => {
      createDataRowsBatchSizes.push(rows.length);
      const createdRows: DataRow[] = [];
      for (const data of rows) {
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
        createdRows.push(row);
      }
      return createdRows;
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
    deleteDataRowsByImport: async (importId: string) => {
      const deletedRows = dataRowsByImport.get(importId)?.length ?? 0;
      dataRowsByImport.set(importId, []);
      importRowCounts.set(importId, 0);
      return deletedRows;
    },
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
    getDataRowCountByImport: async (importId: string) => importRowCounts.get(importId) ?? 0,
    getImportsWithRowCounts: async () => listImportsWithCounts(),
    listImportsWithRowCountsOffsetPage: async (params: Parameters<typeof listImportsWithOffset>[0]) =>
      listImportsWithOffset(params),
    listImportsWithRowCountsPage: async (params: {
      cursor?: string | null;
      limit?: number;
      search?: string | null;
      createdOn?: string | null;
    }) => listImportsWithCursor(params),
    getImportColumnNames: async (importId: string) =>
      getImportHeaders(dataRowsByImport.get(importId) ?? []),
    markImportOpened: async (importId: string) => {
      const record = importRecords.get(importId);
      if (record) {
        importRecords.set(importId, { ...record, lastOpenedAt: new Date() });
      }
    },
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
      mutationIdempotencyStorage: storage,
      authenticateToken: createTestAuthenticateToken({
        userId: "admin-1",
        username: "admin.user",
        role: "admin",
      }),
      requireRole: createTestRequireRole(),
      requireTabAccess: () => allowAllTabs(),
      searchRateLimiter: (_req, _res, next) => next(),
      multipartMaxFileSizeBytes: options?.multipartMaxFileSizeBytes,
    });
  app.use(errorHandler);

  return {
    app,
    auditLogs,
    searchCalls,
    createImportCalls,
    createDataRowCalls,
    createDataRowsBatchSizes,
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
    assert.doesNotThrow(() => importsListResponseSchema.parse(payload));
    assert.equal(payload.imports.length, 3);
    assert.equal(payload.imports[0].id, "import-1");
    assert.equal(payload.imports[0].rowCount, 2);
    assert.deepEqual(payload.pagination, {
      mode: "cursor",
      limit: 100,
      pageSize: 100,
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
      `${baseUrl}/api/imports?pageSize=1&cursor=import-1&search=batch&createdOn=2026-03-09`,
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.doesNotThrow(() => importsListResponseSchema.parse(payload));
    assert.equal(payload.imports.length, 1);
    assert.equal(payload.imports[0].id, "import-2");
    assert.deepEqual(payload.pagination, {
      mode: "cursor",
      limit: 1,
      pageSize: 1,
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

test("GET /api/imports supports offset pagination and server-side saved filters", async () => {
  const { app, listImportsPageCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(
      `${baseUrl}/api/imports?page=1&pageSize=1&search=admin&createdBy=admin&minRows=1&maxRows=2&view=all`,
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.doesNotThrow(() => importsListResponseSchema.parse(payload));
    assert.equal(payload.imports.length, 1);
    assert.equal(payload.imports[0].id, "import-1");
    assert.deepEqual(payload.pagination, {
      mode: "offset",
      page: 1,
      pageSize: 1,
      limit: 1,
      offset: 0,
      total: 2,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    assert.deepEqual(listImportsPageCalls, [{
      page: 1,
      pageSize: 1,
      search: "admin",
      createdBy: "admin",
      createdOn: null,
      minRows: 1,
      maxRows: 2,
      view: "all",
    }]);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports rejects inverted row-count filters", async () => {
  const { app, listImportsPageCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports?page=1&minRows=20&maxRows=10`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, "Minimum rows cannot exceed maximum rows.");
    assert.equal(listImportsPageCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports rejects page-size values below one", async () => {
  const { app, listImportsPageCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (const pageSize of ["0", "-1"]) {
      const response = await fetch(`${baseUrl}/api/imports?pageSize=${pageSize}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).message, "Page limit must be at least 1");
    }

    assert.equal(listImportsPageCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports rejects malformed cursor tokens", async () => {
  const { app } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports?cursor=bad-cursor`);
    assert.equal(response.status, 400);
    assert.deepEqual(
      await response.json(),
      expectApiError("Invalid imports cursor.", ERROR_CODES.REQUEST_BODY_INVALID),
    );
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/data-rows requires an importId", async () => {
  const { app } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/data-rows`);
    assert.equal(response.status, 400);
    assert.deepEqual(
      await response.json(),
      expectApiError("importId is required", ERROR_CODES.REQUEST_BODY_INVALID),
    );
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/data-rows rejects page-size values below one", async () => {
  const { app, searchCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (const pageSize of ["0", "-1"]) {
      const response = await fetch(`${baseUrl}/api/data-rows?importId=import-1&pageSize=${pageSize}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).message, "Page limit must be at least 1");
    }

    assert.equal(searchCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/data-rows forwards pagination and search params to the service layer", async () => {
  const { app, searchCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(
      `${baseUrl}/api/data-rows?importId=import-1&limit=1&page=2&offset=1&q=Bob`,
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.total, 2);
    assert.equal(payload.rows.length, 1);
    assert.equal(payload.rows[0]?.id, "row-2");
    assert.deepEqual(searchCalls[0], {
      columnFilters: [],
      cursor: null,
      importId: "import-1",
      search: "Bob",
      limit: 1,
      offset: 1,
    });
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
    assert.deepEqual(
      await response.json(),
      expectApiError("No data rows provided", ERROR_CODES.REQUEST_BODY_INVALID),
    );
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
    assert.doesNotThrow(() => importMutationResultSchema.parse(payload));
    assert.equal(payload.name, "March Import");
    assert.equal(payload.filename, "march.csv");
    assert.equal(payload.rowCount, 25);
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

test("POST /api/imports accepts multipart file uploads for bulk-friendly imports", async () => {
  const { app, createImportCalls, createDataRowCalls, auditLogs } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const formData = new FormData();
    formData.set("name", "Multipart Import");
    formData.append(
      "file",
      new File(
        ["customer,amount\nAlice,15\nBob,27\n"],
        "multipart-import.csv",
        { type: "text/csv" },
      ),
    );

    const response = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      body: formData,
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.doesNotThrow(() => importMutationResultSchema.parse(payload));
    assert.equal(payload.name, "Multipart Import");
    assert.equal(payload.filename, "multipart-import.csv");
    assert.equal(payload.rowCount, 2);
    assert.equal(createImportCalls.length, 1);
    assert.equal(createImportCalls[0].name, "Multipart Import");
    assert.equal(createDataRowCalls.length, 2);
    assert.deepEqual(createDataRowCalls[0].jsonDataJsonb, {
      customer: "Alice",
      amount: "15",
    });
    assert.equal(auditLogs.length, 1);
    assert.match(String(auditLogs[0].details), /Imported 2 rows from multipart-import\.csv/);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/imports accepts multipart Excel uploads without leaking temp file access errors", async () => {
  const { app, createImportCalls, createDataRowCalls, auditLogs } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet([
    ["customer", "amount"],
    ["Alice", 15],
    ["Bob", 27],
  ]);

  try {
    xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const workbookBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Uint8Array;
    const workbookBlobPart = new Uint8Array(workbookBuffer);
    const formData = new FormData();
    formData.set("name", "Multipart Excel Import");
    formData.append(
      "file",
      new File(
        [workbookBlobPart],
        "multipart-import.xlsx",
        {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ),
    );

    const response = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      body: formData,
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.doesNotThrow(() => importRecordSchema.parse(payload));
    assert.equal(payload.name, "Multipart Excel Import");
    assert.equal(payload.filename, "multipart-import.xlsx");
    assert.equal(createImportCalls.length, 1);
    assert.equal(createImportCalls[0].name, "Multipart Excel Import");
    assert.equal(createDataRowCalls.length, 2);
    assert.deepEqual(createDataRowCalls[0].jsonDataJsonb, {
      customer: "Alice",
      amount: "15",
    });
    assert.equal(auditLogs.length, 1);
    assert.match(String(auditLogs[0].details), /Imported 2 rows from multipart-import\.xlsx/);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/imports replays a completed idempotent import without creating duplicate rows", async () => {
  const { app, createImportCalls, createDataRowCalls, auditLogs } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);
  const headers = {
    "Content-Type": "application/json",
    "x-idempotency-key": "import-create-1",
    "x-idempotency-fingerprint": JSON.stringify({ hash: "same-file", version: 1 }),
  };
  const body = JSON.stringify({
    name: "Idempotent Import",
    filename: "idempotent.csv",
    data: [{ customer: "Alice" }, { customer: "Bob" }],
  });

  try {
    const firstResponse = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers,
      body,
    });
    const secondResponse = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers,
      body,
    });

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    const firstPayload = await firstResponse.json();
    const secondPayload = await secondResponse.json();
    assert.deepEqual(secondPayload, firstPayload);
    assert.equal(firstPayload.rowCount, 2);
    assert.equal(createImportCalls.length, 1);
    assert.equal(createDataRowCalls.length, 2);
    assert.equal(auditLogs.length, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/imports rejects reuse of an idempotency key for a different file fingerprint", async () => {
  const { app, createImportCalls, createDataRowCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);
  const commonHeaders = {
    "Content-Type": "application/json",
    "x-idempotency-key": "import-create-2",
  };

  try {
    const firstResponse = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "x-idempotency-fingerprint": JSON.stringify({ hash: "file-a", version: 1 }),
      },
      body: JSON.stringify({
        name: "Import A",
        filename: "a.csv",
        data: [{ customer: "Alice" }],
      }),
    });
    const secondResponse = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "x-idempotency-fingerprint": JSON.stringify({ hash: "file-b", version: 1 }),
      },
      body: JSON.stringify({
        name: "Import B",
        filename: "b.csv",
        data: [{ customer: "Bob" }],
      }),
    });

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 409);
    const secondPayload = await secondResponse.json();
    assert.equal(secondPayload.error.code, ERROR_CODES.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH);
    assert.equal(createImportCalls.length, 1);
    assert.equal(createDataRowCalls.length, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/imports releases a failed idempotency reservation so the same file can be retried", async () => {
  const { app, createImportCalls, createDataRowCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);
  const headers = {
    "Content-Type": "application/json",
    "x-idempotency-key": "import-create-retry",
    "x-idempotency-fingerprint": JSON.stringify({ hash: "retry-file", version: 1 }),
  };

  try {
    const failedResponse = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Retry Import",
        filename: "retry.csv",
        data: [],
      }),
    });
    const retryResponse = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Retry Import",
        filename: "retry.csv",
        data: [{ customer: "Recovered" }],
      }),
    });

    assert.equal(failedResponse.status, 400);
    assert.equal(retryResponse.status, 200);
    assert.equal((await retryResponse.json()).rowCount, 1);
    assert.equal(createImportCalls.length, 1);
    assert.equal(createDataRowCalls.length, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/imports processes a production-sized XLSB workbook with bounded database batches", async () => {
  const {
    app,
    createDataRowCalls,
    createDataRowsBatchSizes,
    auditLogs,
  } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);
  const originalBatchSize = runtimeConfig.runtime.importInsertBatchSize;
  runtimeConfig.runtime.importInsertBatchSize = 1_000;
  const headers = Array.from({ length: 41 }, (_, index) => `column_${index + 1}`);
  const rows = Array.from({ length: 3_725 }, (_, rowIndex) =>
    headers.map((_header, columnIndex) => `r${rowIndex + 1}c${columnIndex + 1}`),
  );
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet([headers, ...rows]);

  try {
    xlsx.utils.book_append_sheet(workbook, worksheet, "Import");
    const workbookBuffer = xlsx.write(workbook, {
      type: "buffer",
      bookType: "xlsb",
    }) as Uint8Array;
    const formData = new FormData();
    formData.set("name", "Production XLSB Import");
    formData.append(
      "file",
      new File(
        [new Uint8Array(workbookBuffer)],
        "production-sized.xlsb",
        { type: "application/vnd.ms-excel.sheet.binary.macroenabled.12" },
      ),
    );

    const response = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      body: formData,
    });

    assert.equal(response.status, 200);
    assert.equal(createDataRowCalls.length, 3_725);
    assert.deepEqual(createDataRowsBatchSizes, [1_000, 1_000, 1_000, 725]);
    assert.equal(auditLogs.length, 1);
    assert.match(String(auditLogs[0]?.details), /Imported 3725 rows from production-sized\.xlsb/);
  } finally {
    runtimeConfig.runtime.importInsertBatchSize = originalBatchSize;
    await stopTestServer(server);
  }
});

test("POST /api/imports returns a structured parse error for an excessively wide streamed CSV", async () => {
  const {
    app,
    createImportCalls,
    createDataRowCalls,
    deleteCalls,
    auditLogs,
  } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const headers = Array.from({ length: 301 }, (_, index) => `column_${index + 1}`);
    const values = Array.from({ length: 301 }, (_, index) => String(index + 1));
    const formData = new FormData();
    formData.set("name", "Wide CSV");
    formData.append(
      "file",
      new File(
        [`${headers.join(",")}\n${values.join(",")}\n`],
        "wide-import.csv",
        { type: "text/csv" },
      ),
    );

    const response = await fetch(`${baseUrl}/api/imports`, {
      method: "POST",
      body: formData,
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, ERROR_CODES.IMPORT_PARSE_FAILED);
    assert.equal(payload.error?.code, ERROR_CODES.IMPORT_PARSE_FAILED);
    assert.match(String(payload.message), /column limit of 300/i);
    assert.equal(createImportCalls.length, 0);
    assert.equal(createDataRowCalls.length, 0);
    assert.equal(deleteCalls.length, 0);
    assert.equal(auditLogs.length, 0);
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

test("GET /api/imports/:id/summary returns lightweight drawer metadata", async () => {
  const { app } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-1/summary`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.import.id, "import-1");
    assert.equal(payload.import.rowCount, 2);
    assert.equal(payload.columnCount, 2);
    assert.deepEqual(payload.columns, ["age", "name"]);
    assert.equal("rows" in payload, false);
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
    const response = await fetch(`${baseUrl}/api/imports/import-1/data?page=2&pageSize=400&search=Alice`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.doesNotThrow(() => importDataPageResponseSchema.parse(payload));
    assert.deepEqual(payload.headers, ["age", "name"]);
    assert.equal(payload.page, 2);
    assert.equal(payload.limit, 120);
    assert.equal(payload.pageSize, 120);
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

test("GET /api/imports/:id/data rejects page-size values below one", async () => {
  const { app, searchCalls } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (const pageSize of ["0", "-1"]) {
      const response = await fetch(`${baseUrl}/api/imports/import-1/data?page=1&pageSize=${pageSize}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).message, "Page limit must be at least 1");
    }

    assert.equal(searchCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports/:id/data returns dataset-level headers for sparse imports", async () => {
  const { app } = createImportsRouteHarness({
    seedImportRows: [
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `row-${String(index + 1).padStart(2, "0")}`,
        importId: "import-1",
        jsonDataJsonb: { name: `Customer ${index + 1}`, age: 20 + index },
      })),
      {
        id: "row-11",
        importId: "import-1",
        jsonDataJsonb: { name: "Customer 11", email: "customer11@example.com" },
      },
    ],
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-1/data?page=1&pageSize=10`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.doesNotThrow(() => importDataPageResponseSchema.parse(payload));
    assert.equal(payload.rows.length, 10);
    assert.deepEqual(payload.rows[0]?.jsonDataJsonb, { name: "Customer 1", age: 20 });
    assert.deepEqual(payload.headers, ["age", "email", "name"]);
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
    assert.deepEqual(await response.json(), expectApiError("Import not found", "NOT_FOUND"));
    assert.equal(analyzeImportCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/imports/:id/analyze returns the shared analysis contract", async () => {
  const { app } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-1/analyze`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.doesNotThrow(() => singleImportAnalysisResponseSchema.parse(payload));
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
    assert.doesNotThrow(() => allImportsAnalysisResponseSchema.parse(payload));
    assert.equal(payload.totalImports, 3);
    assert.equal(payload.totalRows, 3);
    assert.deepEqual(analyzeAllCalls, [["import-1", "import-2", "import-3"]]);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/analyze/all returns 504 when analysis exceeds the request deadline", async () => {
  const { app } = createImportsRouteHarness({
    analysisRequestTimeoutMs: 15,
    analysisAllDelayMs: 50,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/analyze/all`);
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Import analysis is taking longer than expected. Please retry in a moment.",
      error: {
        code: "REQUEST_TIMEOUT",
        message: "Import analysis is taking longer than expected. Please retry in a moment.",
        details: {
          operation: "imports-analysis-all",
          timeoutMs: 15,
        },
      },
    });
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
    const response = await fetch(`${baseUrl}/api/imports/import-1/data?page=1&pageSize=20&columnFilters=${filters}`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.doesNotThrow(() => importDataPageResponseSchema.parse(payload));
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
    const firstResponse = await fetch(`${baseUrl}/api/imports/import-1/data?page=1&pageSize=10`);
    assert.equal(firstResponse.status, 200);

    const firstPayload = await firstResponse.json();
    assert.doesNotThrow(() => importDataPageResponseSchema.parse(firstPayload));
    assert.deepEqual(firstPayload.headers, ["age", "name"]);
    assert.equal(firstPayload.page, 1);
    assert.equal(firstPayload.pageSize, 10);
    assert.equal(firstPayload.rows.length, 10);
    assert.equal(firstPayload.rows[0]?.jsonDataJsonb?.name, "Customer 1");
    assert.equal(typeof firstPayload.nextCursor, "string");

    const secondResponse = await fetch(
      `${baseUrl}/api/imports/import-1/data?page=2&pageSize=10&cursor=${encodeURIComponent(String(firstPayload.nextCursor || ""))}`,
    );
    assert.equal(secondResponse.status, 200);

    const secondPayload = await secondResponse.json();
    assert.doesNotThrow(() => importDataPageResponseSchema.parse(secondPayload));
    assert.deepEqual(secondPayload.headers, ["age", "name"]);
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
    assert.deepEqual(
      await response.json(),
      expectApiError("Invalid import data cursor.", ERROR_CODES.REQUEST_BODY_INVALID),
    );
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
    assert.deepEqual(
      await response.json(),
      expectApiError("Invalid viewer column filters.", ERROR_CODES.REQUEST_BODY_INVALID),
    );
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
    assert.doesNotThrow(() => importRecordSchema.parse(payload));
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

test("PATCH /api/imports/:id/rename returns 404 when the import is missing", async () => {
  const { app } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-missing/rename`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Renamed Import",
      }),
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), expectApiError("Import not found", "NOT_FOUND"));
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
    const payload = await response.json();
    assert.doesNotThrow(() => deleteImportResponseSchema.parse(payload));
    assert.deepEqual(payload, {
      ok: true,
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

test("DELETE /api/imports/:id returns 404 when the import is missing", async () => {
  const { app } = createImportsRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/imports/import-missing`, {
      method: "DELETE",
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), expectApiError("Import not found", "NOT_FOUND"));
  } finally {
    await stopTestServer(server);
  }
});
