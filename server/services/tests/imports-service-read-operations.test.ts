import assert from "node:assert/strict";
import test from "node:test";
import { ImportsServiceReadOperations } from "../imports-service-read-operations";
import { encodeImportDataPageCursor, parseImportDataPageCursor } from "../imports-service-parsers";
import type {
  ImportsServiceAnalysis,
  ImportsServiceRepository,
  ImportsServiceStorage,
} from "../imports-service-types";

function createReadOperations(params: {
  storage?: Partial<ImportsServiceStorage>;
  repository?: Partial<ImportsServiceRepository>;
  analysis?: Partial<ImportsServiceAnalysis>;
} = {}) {
  const storage = {
    getImportById: async () => undefined,
    getDataRowsByImport: async () => [],
    searchDataRows: async () => ({ rows: [], total: 0, nextCursorRowId: null }),
    ...(params.storage ?? {}),
  } as unknown as ImportsServiceStorage;
  const repository = {
    getDataRowCountByImport: async () => 0,
    getImportColumnNames: async () => [],
    getImportsWithRowCounts: async () => [],
    listImportsWithRowCountsOffsetPage: async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      offset: 0,
    }),
    listImportsWithRowCountsPage: async () => ({
      items: [],
      total: 0,
      limit: 100,
      nextCursor: null,
    }),
    markImportOpened: async () => undefined,
    ...(params.repository ?? {}),
  } as unknown as ImportsServiceRepository;
  const analysis = {
    analyzeAll: async () => ({ totalImports: 0, analyses: [] }),
    analyzeImport: async () => null,
    ...(params.analysis ?? {}),
  } as unknown as ImportsServiceAnalysis;

  return new ImportsServiceReadOperations(storage, repository, analysis);
}

function createEmptyAnalysisResult() {
  return {
    icLelaki: { count: 0, samples: [] },
    icPerempuan: { count: 0, samples: [] },
    noPolis: { count: 0, samples: [] },
    noTentera: { count: 0, samples: [] },
    passportMY: { count: 0, samples: [] },
    passportLuarNegara: { count: 0, samples: [] },
    duplicates: { count: 0, items: [] },
    quality: {
      score: 0,
      grade: "no_data" as const,
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
  };
}

test("getImportDataPage emits stable hybrid pagination metadata", async () => {
  let capturedSearch: Parameters<ImportsServiceStorage["searchDataRows"]>[0] | null = null;
  const operations = createReadOperations({
    storage: {
      searchDataRows: async (params) => {
        capturedSearch = params;
        return {
          rows: [
            {
              id: "row-1",
              importId: params.importId,
              jsonDataJsonb: { amount: 10, name: "Alice" },
            },
          ],
          total: 125,
          nextCursorRowId: "row-1",
        };
      },
    },
  });

  const result = await operations.getImportDataPage({
    importId: "import-1",
    page: 2,
    requestedLimit: 1_000,
    viewerRowsPerPage: 80,
    isDbProtected: true,
    search: "  Alice  ",
    columnFilters: [{ column: "name", operator: "contains", value: "Alice" }],
  });

  assert.deepEqual(capturedSearch, {
    importId: "import-1",
    search: "Alice",
    limit: 80,
    offset: 80,
    columnFilters: [{ column: "name", operator: "contains", value: "Alice" }],
    cursor: null,
  });
  assert.deepEqual(result.headers, ["amount", "name"]);
  assert.equal(result.page, 2);
  assert.equal(result.limit, 80);
  assert.equal(result.offset, 80);
  assert.equal(result.pagination.mode, "hybrid");
  assert.equal(result.pagination.totalPages, 2);
  assert.equal(result.pagination.hasNextPage, true);
  assert.equal(result.pagination.hasPreviousPage, true);
  assert.deepEqual(parseImportDataPageCursor(result.nextCursor), {
    lastRowId: "row-1",
    page: 3,
  });
});

test("getImportDataPage enriches legacy Saved rows and exposes derived location headers", async () => {
  const operations = createReadOperations({
    storage: {
      searchDataRows: async () => ({
        rows: [{
          id: "row-location",
          importId: "import-location",
          jsonDataJsonb: { HomePostcode: "9600" },
        }],
        total: 1,
        nextCursorRowId: null,
      }),
    },
    repository: {
      getImportColumnNames: async () => ["HomePostcode"],
    },
  });

  const result = await operations.getImportDataPage({
    importId: "import-location",
    page: 1,
    requestedLimit: 20,
    viewerRowsPerPage: 20,
    isDbProtected: false,
  });

  assert.deepEqual(result.headers, [
    "HomePostcode",
    "Home Postal District",
    "Home State",
  ]);
  assert.deepEqual(result.rows[0]?.jsonDataJsonb, {
    HomePostcode: "09600",
    "Home Postal District": "Lunas",
    "Home State": "Kedah",
  });
});

test("getImportDataPage honors cursors while preserving logical page offsets", async () => {
  const cursor = encodeImportDataPageCursor({
    lastRowId: "row-40",
    page: 3,
  });
  let capturedSearch: Parameters<ImportsServiceStorage["searchDataRows"]>[0] | null = null;
  const operations = createReadOperations({
    storage: {
      searchDataRows: async (params) => {
        capturedSearch = params;
        return {
          rows: [],
          total: 41,
          nextCursorRowId: null,
        };
      },
    },
    repository: {
      getImportColumnNames: async () => ["name"],
    },
  });

  const result = await operations.getImportDataPage({
    importId: "import-1",
    page: 99,
    cursor,
    requestedLimit: 20,
    viewerRowsPerPage: 100,
    isDbProtected: false,
  });

  assert.deepEqual(capturedSearch, {
    importId: "import-1",
    search: null,
    limit: 20,
    offset: 0,
    columnFilters: [],
    cursor: "row-40",
  });
  assert.equal(result.page, 3);
  assert.equal(result.offset, 40);
  assert.equal(result.nextCursor, null);
  assert.deepEqual(result.pagination, {
    mode: "hybrid",
    page: 3,
    pageSize: 20,
    limit: 20,
    offset: 40,
    total: 41,
    totalPages: 3,
    nextCursor: null,
    hasNextPage: false,
    hasPreviousPage: true,
  });
});

test("getImportDataPage rejects malformed cursors before querying storage", async () => {
  let searchCalls = 0;
  const operations = createReadOperations({
    storage: {
      searchDataRows: async () => {
        searchCalls += 1;
        return { rows: [], total: 0, nextCursorRowId: null };
      },
    },
  });

  await assert.rejects(
    () => operations.getImportDataPage({
      importId: "import-1",
      page: 1,
      cursor: "not-a-valid-cursor",
      requestedLimit: 20,
      viewerRowsPerPage: 100,
      isDbProtected: false,
    }),
    /Invalid import data cursor/,
  );
  assert.equal(searchCalls, 0);
});

test("getImportSummary returns row and column metadata without loading data rows", async () => {
  let fullRowLoads = 0;
  const operations = createReadOperations({
    storage: {
      getImportById: async () => ({
        id: "import-1",
        name: "Dataset",
        filename: "dataset.csv",
        createdAt: new Date(),
        lastOpenedAt: null,
        isDeleted: false,
        createdBy: "admin.user",
        contentHashSha256: null,
        sourceSizeBytes: 1024,
      }),
      getDataRowsByImport: async () => {
        fullRowLoads += 1;
        return [];
      },
    },
    repository: {
      getDataRowCountByImport: async () => 25,
      getImportColumnNames: async () => ["amount", "name"],
    },
  });

  const result = await operations.getImportSummary("import-1");

  assert.equal(result?.import.rowCount, 25);
  assert.deepEqual(result?.columns, ["amount", "name"]);
  assert.equal(result?.columnCount, 2);
  assert.equal(fullRowLoads, 0);
});

test("analysis operations forward abort signals to the analysis service", async () => {
  const controller = new AbortController();
  const capturedSignals: Array<AbortSignal | undefined> = [];
  const openedImportIds: string[] = [];
  const operations = createReadOperations({
    storage: {
      getImportById: async () => ({
        id: "import-1",
        name: "Dataset",
        filename: "dataset.csv",
        createdAt: new Date(),
        lastOpenedAt: null,
        isDeleted: false,
        createdBy: "admin.user",
        contentHashSha256: null,
        sourceSizeBytes: null,
      }),
    },
    repository: {
      markImportOpened: async (importId) => {
        openedImportIds.push(importId);
      },
      getImportsWithRowCounts: async () => [{
        id: "import-1",
        name: "Dataset",
        filename: "dataset.csv",
        createdAt: new Date(),
        lastOpenedAt: null,
        isDeleted: false,
        createdBy: "admin.user",
        contentHashSha256: null,
        sourceSizeBytes: null,
        rowCount: 1,
      }],
    },
    analysis: {
      analyzeImport: async (_importRecord, signal) => {
        capturedSignals.push(signal);
        return {
          import: { id: "import-1", name: "Dataset", filename: "dataset.csv" },
          totalRows: 1,
          analysis: createEmptyAnalysisResult(),
        };
      },
      analyzeAll: async (_imports, signal) => {
        capturedSignals.push(signal);
        return {
          totalImports: 1,
          totalRows: 1,
          imports: [],
          analysis: createEmptyAnalysisResult(),
        };
      },
    },
  });

  await operations.analyzeImport("import-1", controller.signal);
  await operations.analyzeAll(controller.signal);

  assert.deepEqual(capturedSignals, [controller.signal, controller.signal]);
  assert.deepEqual(openedImportIds, ["import-1"]);
});
