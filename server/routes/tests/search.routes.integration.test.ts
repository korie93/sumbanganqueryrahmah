import assert from "node:assert/strict";
import test from "node:test";
import { createSearchController } from "../../controllers/search.controller";
import type { SearchRepository } from "../../repositories/search.repository";
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
}) {
  const globalSearchCalls: Array<Record<string, unknown>> = [];
  const simpleSearchCalls: string[] = [];
  const advancedSearchCalls: Array<Record<string, unknown>> = [];
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
      username: "user.one",
      role: "user",
      activityId: "activity-1",
    }),
    searchRateLimiter: (_req, _res, next) => next(),
  });

  return {
    app,
    globalSearchCalls,
    simpleSearchCalls,
    advancedSearchCalls,
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
    const response = await fetch(`${baseUrl}/api/search/global?q=a&page=1&limit=50`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      columns: [],
      rows: [],
      results: [],
      total: 0,
    });
    assert.equal(globalSearchCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/global applies the protected limit cap and formats rows with source data", async () => {
  const { app, globalSearchCalls } = createSearchRouteHarness({
    searchResultLimit: 200,
    isDbProtected: true,
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/search/global?q=Alice&page=2&limit=150`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.page, 2);
    assert.equal(payload.limit, 80);
    assert.equal(payload.total, 25);
    assert.deepEqual(payload.columns, ["name", "ic", "Source File"]);
    assert.deepEqual(payload.rows, [
      {
        name: "Alice",
        ic: "900101015555",
        "Source File": "march.csv",
      },
    ]);
    assert.deepEqual(globalSearchCalls, [{
      search: "Alice",
      limit: 80,
      offset: 80,
    }]);
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
    const response = await fetch(`${baseUrl}/api/search/global?q=Alice&page=4&limit=20`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      columns: [],
      rows: [],
      results: [],
      total: 60,
      page: 4,
      limit: 20,
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
  const { app, advancedSearchCalls } = createSearchRouteHarness({
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
        limit: 50,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.page, 2);
    assert.equal(payload.limit, 25);
    assert.equal(payload.total, 18);
    assert.deepEqual(payload.headers, ["name", "phone", "Source File"]);
    assert.deepEqual(payload.results, [
      {
        name: "Bob",
        phone: "0123456789",
        "Source File": "april.csv",
      },
    ]);
    assert.deepEqual(advancedSearchCalls, [{
      filters: [{ field: "name", operator: "contains", value: "Bob" }],
      logic: "OR",
      limit: 25,
      offset: 50,
    }]);
  } finally {
    await stopTestServer(server);
  }
});
