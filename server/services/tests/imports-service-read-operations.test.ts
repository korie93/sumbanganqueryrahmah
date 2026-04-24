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
    getImportColumnNames: async () => [],
    getImportsWithRowCounts: async () => [],
    listImportsWithRowCountsPage: async () => ({
      imports: [],
      total: 0,
      limit: 100,
      nextCursor: null,
    }),
    ...(params.repository ?? {}),
  } as unknown as ImportsServiceRepository;
  const analysis = {
    analyzeAll: async () => ({ totalImports: 0, analyses: [] }),
    analyzeImport: async () => null,
    ...(params.analysis ?? {}),
  } as unknown as ImportsServiceAnalysis;

  return new ImportsServiceReadOperations(storage, repository, analysis);
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
