import assert from "node:assert/strict";
import test from "node:test";
import { createSearchController } from "../../controllers/search.controller";
import { errorHandler } from "../../middleware/error-handler";
import type { SearchRepository } from "../../repositories/search.repository";
import type { SearchCollectionViewerScope } from "../../repositories/search-repository-types";
import { SearchService } from "../../services/search.service";
import { registerSearchRoutes } from "../search.routes";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

function createSearchRouteHarness(options?: {
  searchResultLimit?: number;
  isDbProtected?: boolean;
  role?: "admin" | "manager" | "superuser" | "user";
}) {
  const globalSearchCalls: Array<Record<string, unknown>> = [];
  const simpleSearchCalls: string[] = [];
  const advancedSearchCalls: Array<Record<string, unknown>> = [];
  const searchRateLimiterCalls: string[] = [];
  const collectionStatusCalls: Array<Array<Record<string, unknown>>> = [];
  const collectionStatusScopes: SearchCollectionViewerScope[] = [];
  let getColumnsCallCount = 0;

  const searchRepository = {
    getAllColumnNames: async () => {
      getColumnsCallCount += 1;
      return ["name", "ic", "phone"];
    },
    searchGlobalDataRows: async (params: { search: string; limit: number; offset: number }) => {
      globalSearchCalls.push(params);
      return {
        rows: [
          {
            id: "row-1",
            importId: "import-1",
            importName: "March Import",
            importFilename: "march.csv",
            jsonDataJsonb: {
              name: "Alice",
              ic: "900101015555",
            },
          },
        ],
        total: 25,
      };
    },
    findCollectionStatusesForRows: async (
      candidates: Array<Record<string, unknown>>,
      viewerScope: SearchCollectionViewerScope,
    ) => {
      collectionStatusCalls.push(candidates);
      collectionStatusScopes.push(viewerScope);
      return candidates
        .filter((candidate) => candidate.rowId === "row-1")
        .map(() => ({
          rowId: "row-1",
          recordCount: 2,
          isHistorical: false,
          latestPaymentDate: "2026-08-01",
          latestCreatedAt: "2026-08-01T08:00:00.000Z",
          latestStaffNickname: "Collector Alpha",
          latestCreatedByLogin: "user.one",
          latestAccountNumber: "ACC-1001",
          matchedAccountHash: null,
          latestAmount: "150.50",
          sourceImportName: "March Import",
          sourceFilename: "march.csv",
          purgedAt: null,
          purgedBy: null,
          matchBasis: "source_and_identifier" as const,
        }));
    },
    searchSimpleDataRows: async (search: string) => {
      simpleSearchCalls.push(search);
      return {
        rows: [
          {
            importId: "import-1",
            importName: "March Import",
            jsonDataJsonb: {
              name: "Alice",
            },
          },
        ],
      };
    },
    advancedSearchDataRows: async (
      filters: Array<{ field: string; operator: string; value: string }>,
      logic: "AND" | "OR",
      limit: number,
      offset: number,
    ) => {
      advancedSearchCalls.push({
        filters,
        logic,
        limit,
        offset,
      });
      return {
        rows: [
          {
            id: "row-2",
            importId: "import-2",
            importName: "April Import",
            importFilename: "april.csv",
            jsonDataJsonb: {
              name: "Bob",
              phone: "0123456789",
            },
          },
        ],
        total: 18,
      };
    },
  } as unknown as SearchRepository;
  const role = options?.role ?? "user";
  const app = createJsonTestApp();
  registerSearchRoutes(app, {
    searchController: createSearchController({
      searchService: new SearchService(searchRepository),
      getRuntimeSettingsCached: async () => ({
        searchResultLimit: options?.searchResultLimit ?? 200,
      }),
      isDbProtected: () => options?.isDbProtected ?? false,
    }),
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "viewer.two",
      role,
      activityId: "activity-1",
    }),
    searchRateLimiter: (req, _res, next) => {
      searchRateLimiterCalls.push(req.path);
      next();
    },
  });
  app.use(errorHandler);

  return {
    app,
    globalSearchCalls,
    simpleSearchCalls,
    advancedSearchCalls,
    searchRateLimiterCalls,
    collectionStatusCalls,
    collectionStatusScopes,
    getColumnsCallCount: () => getColumnsCallCount,
  };
}

test("GET /api/search/columns returns available search columns", async () => {
  const { app, getColumnsCallCount } = createSearchRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search/columns`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), ["name", "ic", "phone"]);
    assert.equal(getColumnsCallCount(), 1);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/columns mirrors the search columns endpoint", async () => {
  const { app, getColumnsCallCount } = createSearchRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/columns`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), ["name", "ic", "phone"]);
    assert.equal(getColumnsCallCount(), 1);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/global returns an empty payload for short queries without hitting the repository", async () => {
  const { app, globalSearchCalls } = createSearchRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search/global?q=a&page=1&pageSize=50`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      columns: [],
      rows: [],
      results: [],
      total: 0,
      totalIsApproximate: false,
      page: 1,
      limit: 50,
      pageSize: 50,
      offset: 0,
      pagination: {
        mode: "offset",
        page: 1,
        pageSize: 50,
        limit: 50,
        offset: 0,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    assert.equal(globalSearchCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/global applies the protected limit cap and returns a privacy-safe collection status", async () => {
  const { app, collectionStatusCalls, collectionStatusScopes, globalSearchCalls } = createSearchRouteHarness({
    searchResultLimit: 200,
    isDbProtected: true,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search/global?q=Alice&page=2&pageSize=150`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.page, 2);
    assert.equal(payload.limit, 80);
    assert.equal(payload.pageSize, 80);
    assert.equal(payload.offset, 80);
    assert.equal(payload.total, 25);
    assert.deepEqual(payload.pagination, {
      mode: "offset",
      page: 2,
      pageSize: 80,
      limit: 80,
      offset: 80,
      total: 25,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    assert.deepEqual(payload.columns, ["name", "ic"]);
    assert.deepEqual(payload.rows, [
      {
        name: "Alice",
        ic: "900101015555",
        _collectionStatus: {
          state: "recorded",
          recordCount: 2,
          latestPaymentDate: "2026-08-01",
          latestCreatedAt: "2026-08-01T08:00:00.000Z",
          latestStaffNickname: "Collector Alpha",
          latestCreatedByLogin: "user.one",
          latestAccountNumber: "ACC-1001",
          latestAmount: "150.50",
          sourceImportName: null,
          sourceFilename: null,
          purgedAt: null,
          purgedBy: null,
          matchBasis: "source_and_identifier",
        },
      },
    ]);
    assert.equal(collectionStatusCalls.length, 1);
    assert.equal(collectionStatusCalls[0]?.[0]?.rowId, "row-1");
    assert.equal(collectionStatusCalls[0]?.[0]?.sourceImportId, "import-1");
    assert.deepEqual(collectionStatusScopes, [{ kind: "all" }]);
    assert.deepEqual(globalSearchCalls, [{
      search: "Alice",
      limit: 80,
      offset: 80,
    }]);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/global exposes source details only to an authorized admin", async () => {
  const { app, collectionStatusScopes } = createSearchRouteHarness({ role: "admin" });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search/global?q=Alice&page=1&pageSize=20`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.columns, ["name", "ic", "Source File"]);
    assert.equal(payload.rows[0]?.["Source File"], "march.csv");
    assert.deepEqual(payload.rows[0]?._collectionStatus, {
      state: "recorded",
      recordCount: 2,
      latestPaymentDate: "2026-08-01",
      latestCreatedAt: "2026-08-01T08:00:00.000Z",
      latestStaffNickname: "Collector Alpha",
      latestCreatedByLogin: "user.one",
      latestAccountNumber: "ACC-1001",
      latestAmount: "150.50",
      sourceImportName: "March Import",
      sourceFilename: "march.csv",
      purgedAt: null,
      purgedBy: null,
      matchBasis: "source_and_identifier",
    });
    assert.deepEqual(collectionStatusScopes, [{ kind: "all" }]);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/global exposes cross-user collection status to an authenticated user", async () => {
  const { app, collectionStatusScopes } = createSearchRouteHarness({ role: "user" });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search/global?q=Alice&page=1&pageSize=20`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(collectionStatusScopes, [{ kind: "all" }]);
    assert.equal(payload.rows[0]?._collectionStatus?.state, "recorded");
    assert.equal(payload.rows[0]?._collectionStatus?.latestCreatedByLogin, "user.one");
    assert.equal(payload.rows[0]?._collectionStatus?.sourceImportName, null);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/global grants manager all-staff collection visibility without Saved source details", async () => {
  const { app, collectionStatusScopes } = createSearchRouteHarness({ role: "manager" });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search/global?q=Alice&page=1&pageSize=20`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(collectionStatusScopes, [{ kind: "all" }]);
    assert.equal(payload.rows[0]?.["Source File"], undefined);
    assert.equal(payload.rows[0]?._collectionStatus?.sourceImportName, null);
    assert.equal(payload.rows[0]?._collectionStatus?.latestCreatedByLogin, "user.one");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/global rejects page-size values below one", async () => {
  const { app, globalSearchCalls } = createSearchRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (const pageSize of ["0", "-1"]) {
      const response = await fetch(`${baseUrl}/api/search/global?q=Alice&page=1&pageSize=${pageSize}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).message, "Page limit must be at least 1");
    }

    assert.equal(globalSearchCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/global accepts page-size value one", async () => {
  const { app } = createSearchRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search/global?q=Alice&page=1&pageSize=1`);
    assert.equal(response.status, 200);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/global returns an empty page when the offset exceeds the runtime max", async () => {
  const { app, globalSearchCalls } = createSearchRouteHarness({
    searchResultLimit: 60,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search/global?q=Alice&page=4&pageSize=20`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      columns: [],
      rows: [],
      results: [],
      total: 60,
      totalIsApproximate: false,
      page: 4,
      limit: 20,
      pageSize: 20,
      offset: 60,
      pagination: {
        mode: "offset",
        page: 4,
        pageSize: 20,
        limit: 20,
        offset: 60,
        total: 60,
        totalPages: 3,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
    assert.equal(globalSearchCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search returns mapped simple search results", async () => {
  const { app, simpleSearchCalls } = createSearchRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search?q=Alice`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      results: [
        {
          name: "Alice",
          _importId: "import-1",
          _importName: "March Import",
        },
      ],
      total: 1,
    });
    assert.deepEqual(simpleSearchCalls, ["Alice"]);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/search/advanced applies runtime pagination and formats headers", async () => {
  const { app, advancedSearchCalls, searchRateLimiterCalls } = createSearchRouteHarness({
    searchResultLimit: 75,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search/advanced`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: [{ field: "name", operator: "contains", value: "Bob" }],
        logic: "OR",
        page: 2,
        pageSize: 50,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.page, 2);
    assert.equal(payload.limit, 25);
    assert.equal(payload.pageSize, 25);
    assert.equal(payload.offset, 50);
    assert.equal(payload.total, 18);
    assert.deepEqual(payload.pagination, {
      mode: "offset",
      page: 2,
      pageSize: 25,
      limit: 25,
      offset: 50,
      total: 18,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    assert.deepEqual(payload.headers, ["name", "phone"]);
    assert.deepEqual(payload.results, [
      {
        name: "Bob",
        phone: "0123456789",
        _collectionStatus: {
          state: "not_recorded",
          recordCount: 0,
          latestPaymentDate: null,
          latestCreatedAt: null,
          latestStaffNickname: null,
          latestCreatedByLogin: null,
          latestAccountNumber: null,
          latestAmount: null,
          sourceImportName: null,
          sourceFilename: null,
          purgedAt: null,
          purgedBy: null,
          matchBasis: null,
        },
      },
    ]);
    assert.deepEqual(advancedSearchCalls, [{
      filters: [{ field: "name", operator: "contains", value: "Bob" }],
      logic: "OR",
      limit: 25,
      offset: 50,
    }]);
    assert.deepEqual(searchRateLimiterCalls, ["/api/search/advanced"]);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/search/advanced rejects body limits below one", async () => {
  const { app, advancedSearchCalls } = createSearchRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    for (const pageSize of [0, -1]) {
      const response = await fetch(`${baseUrl}/api/search/advanced`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters: [{ field: "name", operator: "contains", value: "Bob" }],
          page: 1,
          pageSize,
        }),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).message, "Page limit must be at least 1");
    }

    assert.equal(advancedSearchCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});
