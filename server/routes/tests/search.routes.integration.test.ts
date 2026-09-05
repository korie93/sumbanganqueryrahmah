import assert from "node:assert/strict";
import test from "node:test";
import { createSearchController } from "../../controllers/search.controller";
import { errorHandler } from "../../middleware/error-handler";
import type { SearchRepository } from "../../repositories/search.repository";
import type { SearchCollectionViewerScope } from "../../repositories/search-repository-types";
import { SearchService } from "../../services/search.service";
import { encodeSearchCollectionHistoryKey } from "../../services/search-collection-history-key";
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
  const collectionHistorySourceCalls: Array<Record<string, unknown>> = [];
  const collectionHistoryCalls: Array<Record<string, unknown>> = [];
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
    findCollectionHistorySourceRow: async (identity: Record<string, unknown>) => {
      collectionHistorySourceCalls.push(identity);
      return identity.sourceImportId === "import-1" && identity.sourceDataRowId === "row-1"
        ? {
            id: "row-1",
            importId: "import-1",
            jsonDataJsonb: { "Account No": "ACC-1001" },
            sourceObligationKey: "account:opaque-source-hash",
          }
        : null;
    },
    findCollectionHistoryForRow: async (params: Record<string, unknown>) => {
      collectionHistoryCalls.push(params);
      const includeManualAuditDetails = params.includeManualAuditDetails === true;
      return {
        items: [{
          id: "pool:record-1:1",
          kind: "pool",
          isHistorical: false,
          paymentDate: "2026-08-01",
          createdAt: "2026-08-01T09:00:00.000Z",
          amount: "350.00",
          classificationSource: "manual_verified_abort",
          automaticClassification: null,
          effectiveStatus: "abort_cp",
          settlementDate: "2026-08-01",
          staffNickname: null,
          createdByLogin: "superuser.one",
          sourceImportName: null,
          sourceFilename: null,
          purgedAt: null,
          purgedBy: null,
          ...(includeManualAuditDetails
            ? {
                reason: "EXTERNAL_UNASSIGNED_PAYMENT",
                note: "Verified",
                reference: "BANK-REF-1",
              }
            : {}),
        }],
        summary: {
          recordCount: 2,
          activeRecordCount: 2,
          historicalRecordCount: 0,
          poolContributionCount: 1,
          collectionAmount: "150.00",
          poolAmount: "350.00",
          totalCoveredAmount: "500.00",
          effectiveStatus: "abort_cp",
        },
        page: Number(params.page || 1),
        pageSize: Number(params.pageSize || 10),
        total: 3,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
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
    collectionHistorySourceCalls,
    collectionHistoryCalls,
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
    const historyKey = payload.rows[0]?._collectionStatus?.historyKey;
    assert.match(String(historyKey), /^sch1\./);
    delete payload.rows[0]?._collectionStatus?.historyKey;
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
    assert.match(String(payload.rows[0]?._collectionStatus?.historyKey), /^sch1\./);
    delete payload.rows[0]?._collectionStatus?.historyKey;
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

test("GET /api/search/collection-history lazily resolves an opaque source key and paginates", async () => {
  const {
    app,
    collectionHistoryCalls,
    collectionHistorySourceCalls,
    searchRateLimiterCalls,
  } = createSearchRouteHarness({ role: "user" });
  const { server, baseUrl } = await startTestServer(app);
  const key = encodeSearchCollectionHistoryKey({
    sourceImportId: "import-1",
    sourceDataRowId: "row-1",
  });

  try {
    const response = await fetch(
      `${baseUrl}/api/search/collection-history?key=${encodeURIComponent(key)}&page=2&pageSize=5`,
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.page, 2);
    assert.equal(payload.pageSize, 5);
    assert.equal(payload.summary.collectionAmount, "150.00");
    assert.equal(payload.summary.poolAmount, "350.00");
    assert.equal(payload.items[0]?.kind, "pool");
    assert.equal("reason" in payload.items[0], false);
    assert.deepEqual(collectionHistorySourceCalls, [{
      sourceImportId: "import-1",
      sourceDataRowId: "row-1",
    }]);
    assert.equal(collectionHistoryCalls.length, 1);
    assert.equal(collectionHistoryCalls[0]?.includeManualAuditDetails, false);
    assert.equal(collectionHistoryCalls[0]?.includeSourceDetails, false);
    assert.deepEqual(collectionHistoryCalls[0]?.viewerScope, { kind: "all" });
    assert.equal(searchRateLimiterCalls.includes("/api/search/collection-history"), true);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/collection-history reveals manual audit fields only to superuser", async () => {
  const { app, collectionHistoryCalls } = createSearchRouteHarness({ role: "superuser" });
  const { server, baseUrl } = await startTestServer(app);
  const key = encodeSearchCollectionHistoryKey({
    sourceImportId: "import-1",
    sourceDataRowId: "row-1",
  });

  try {
    const response = await fetch(
      `${baseUrl}/api/search/collection-history?key=${encodeURIComponent(key)}`,
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.items[0]?.reason, "EXTERNAL_UNASSIGNED_PAYMENT");
    assert.equal(payload.items[0]?.reference, "BANK-REF-1");
    assert.equal(collectionHistoryCalls[0]?.includeManualAuditDetails, true);
    assert.equal(collectionHistoryCalls[0]?.includeSourceDetails, true);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/collection-history rejects tampered keys before any source lookup", async () => {
  const { app, collectionHistorySourceCalls } = createSearchRouteHarness({ role: "user" });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(
      `${baseUrl}/api/search/collection-history?key=${encodeURIComponent("sch1.invalid.invalid.invalid")}`,
    );
    assert.equal(response.status, 400);
    assert.match(String((await response.json()).message), /invalid collection history key/i);
    assert.equal(collectionHistorySourceCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/search/collection-history requires an existing active source row", async () => {
  const { app, collectionHistoryCalls } = createSearchRouteHarness({ role: "user" });
  const { server, baseUrl } = await startTestServer(app);
  const key = encodeSearchCollectionHistoryKey({
    sourceImportId: "import-missing",
    sourceDataRowId: "row-missing",
  });

  try {
    const response = await fetch(
      `${baseUrl}/api/search/collection-history?key=${encodeURIComponent(key)}`,
    );
    assert.equal(response.status, 404);
    assert.equal(collectionHistoryCalls.length, 0);
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
