import assert from "node:assert/strict";
import test from "node:test";
import {
  activityHeartbeat,
  activityHeartbeatLight,
  getAllActivity,
  getBannedUsers,
  getFilteredActivity,
} from "@/lib/api/activity";
import { searchAI } from "@/lib/api/ai";
import {
  getAnalyticsSummary,
  getLoginTrends,
  getPeakHours,
  getRoleDistribution,
  getTopActiveUsers,
} from "@/lib/api/analytics";
import {
  advancedSearchData,
  getSearchColumns,
  searchData,
} from "@/lib/api/search";
import { getMaintenanceStatus } from "@/lib/api/settings";
import {
  activateAccount,
  changeMyPassword,
  checkHealth,
  getDevMailOutboxPreviews,
  login,
  getPendingPasswordResetRequests,
  getSuperuserManagedUsers,
  validateActivationToken,
} from "@/lib/api/auth";
import { getCollectionRecords } from "@/lib/api/collection";
import { analyzeAll, analyzeImport, createImport, deleteImport, getImports, renameImport } from "@/lib/api/imports";
import {
  getAlerts,
  getIntelligenceExplain,
  getSystemHealth,
  getSystemMode,
  getWorkers,
  injectChaos,
} from "@/lib/api/monitor";

function withMockFetch(mock: typeof fetch): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

test("admin list API wrappers forward query params and AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    const url = String(input);
    if (url.startsWith("/api/admin/users")) {
      return jsonResponse({
        ok: true,
        users: [],
        pagination: { page: 2, pageSize: 20, total: 0, totalPages: 1 },
      });
    }
    if (url.startsWith("/api/admin/password-reset-requests")) {
      return jsonResponse({
        ok: true,
        requests: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
      });
    }
    if (url.startsWith("/api/admin/dev-mail-outbox")) {
      return jsonResponse({
        ok: true,
        enabled: true,
        previews: [],
        pagination: { page: 3, pageSize: 15, total: 0, totalPages: 1 },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await getSuperuserManagedUsers(
      {
        page: 2,
        pageSize: 20,
        search: "alice",
        role: "admin",
        status: "active",
      },
      { signal: controller.signal },
    );
    await getPendingPasswordResetRequests(
      {
        page: 1,
        pageSize: 10,
        search: "bob",
        status: "pending_activation",
      },
      { signal: controller.signal },
    );
    await getDevMailOutboxPreviews(
      {
        page: 3,
        pageSize: 15,
        searchEmail: "dev@example.com",
        searchSubject: "reset",
        sortDirection: "asc",
      },
      { signal: controller.signal },
    );
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.signal, controller.signal);
  }

  const managedParams = new URL(`http://localhost${requests[0]?.url || ""}`).searchParams;
  assert.equal(managedParams.get("page"), "2");
  assert.equal(managedParams.get("pageSize"), "20");
  assert.equal(managedParams.get("search"), "alice");
  assert.equal(managedParams.get("role"), "admin");
  assert.equal(managedParams.get("status"), "active");

  const pendingParams = new URL(`http://localhost${requests[1]?.url || ""}`).searchParams;
  assert.equal(pendingParams.get("page"), "1");
  assert.equal(pendingParams.get("pageSize"), "10");
  assert.equal(pendingParams.get("search"), "bob");
  assert.equal(pendingParams.get("status"), "pending_activation");

  const outboxParams = new URL(`http://localhost${requests[2]?.url || ""}`).searchParams;
  assert.equal(outboxParams.get("page"), "3");
  assert.equal(outboxParams.get("pageSize"), "15");
  assert.equal(outboxParams.get("searchEmail"), "dev@example.com");
  assert.equal(outboxParams.get("searchSubject"), "reset");
  assert.equal(outboxParams.get("sortDirection"), "asc");
});

test("getCollectionRecords forwards AbortSignal and rejects on abort", async () => {
  const controller = new AbortController();
  const restoreFetch = withMockFetch(((_input, init) => {
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      if (signal?.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }

      signal?.addEventListener(
        "abort",
        () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        },
        { once: true },
      );

      setTimeout(() => {
        resolve(
          jsonResponse({
            ok: true,
            records: [],
            total: 0,
            totalAmount: 0,
            limit: 10,
            offset: 0,
          }),
        );
      }, 50);
    });
  }) as typeof fetch);

  try {
    const pendingRequest = getCollectionRecords(
      {
        from: "2026-03-01",
        to: "2026-03-31",
        search: "test",
        limit: 10,
        offset: 0,
      },
      { signal: controller.signal },
    );
    controller.abort();
    await assert.rejects(
      pendingRequest,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    );
  } finally {
    restoreFetch();
  }
});

test("analysis API wrappers forward AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    const url = String(input);
    if (url.startsWith("/api/imports/import-123/analyze")) {
      return jsonResponse({
        analysis: {},
        import: { id: "import-123", filename: "sample.csv" },
        totalRows: 0,
      });
    }
    if (url.startsWith("/api/analyze/all")) {
      return jsonResponse({
        analysis: {},
        imports: [],
        totalImports: 0,
        totalRows: 0,
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await analyzeImport("import-123", { signal: controller.signal });
    await analyzeAll({ signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.signal, controller.signal);
  assert.equal(requests[1]?.signal, controller.signal);
  assert.equal(requests[0]?.url, "/api/imports/import-123/analyze");
  assert.equal(requests[1]?.url, "/api/analyze/all");
});

test("createImport forwards AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    return jsonResponse({
      ok: true,
      import: { id: "import-123", name: "Sample Import" },
    });
  }) as typeof fetch);

  try {
    await createImport("Sample Import", "sample.csv", [], { signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.signal, controller.signal);
  assert.equal(requests[0]?.url, "/api/imports");
});

test("saved import API wrappers forward AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    return jsonResponse({ ok: true });
  }) as typeof fetch);

  try {
    await getImports({ signal: controller.signal });
    await renameImport("import-123", "Renamed Import", { signal: controller.signal });
    await deleteImport("import-123", { signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 3);
  assert.equal(requests[0]?.signal, controller.signal);
  assert.equal(requests[1]?.signal, controller.signal);
  assert.equal(requests[2]?.signal, controller.signal);
  assert.equal(requests[0]?.url, "/api/imports");
  assert.equal(requests[1]?.url, "/api/imports/import-123/rename");
  assert.equal(requests[2]?.url, "/api/imports/import-123");
});

test("monitor API wrappers forward AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    const url = String(input);
    if (url === "/internal/system-health") {
      return jsonResponse({ score: 100, mode: "NORMAL" });
    }
    if (url === "/internal/system-mode") {
      return jsonResponse({ mode: "NORMAL" });
    }
    if (url === "/internal/workers") {
      return jsonResponse({ count: 0, maxWorkers: 1, workers: [], updatedAt: Date.now() });
    }
    if (url === "/internal/alerts") {
      return jsonResponse({ alerts: [], updatedAt: Date.now() });
    }
    if (url === "/internal/intelligence/explain") {
      return jsonResponse({
        anomalyBreakdown: {
          normalizedZScore: 0,
          slopeWeight: 0,
          percentileShift: 0,
          correlationWeight: 0,
          forecastRisk: 0,
          mutationFactor: 1,
          weightedScore: 0,
        },
        correlationMatrix: {
          cpuToLatency: 0,
          dbToErrors: 0,
          aiToQueue: 0,
          boostedPairs: [],
        },
        slopeValues: {},
        forecastProjection: [],
        governanceState: "IDLE",
        chosenStrategy: {
          strategy: "CONSERVATIVE",
          recommendedAction: "NONE",
          confidenceScore: 0.5,
          reason: "No evaluation yet.",
        },
        decisionReason: "No evaluation yet.",
      });
    }
    if (url === "/internal/chaos/inject") {
      return jsonResponse({
        success: true,
        injected: {
          id: "event-1",
          type: "cpu_spike",
          magnitude: 2,
          createdAt: Date.now(),
          expiresAt: Date.now() + 1000,
        },
        active: [],
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await getSystemHealth({ signal: controller.signal });
    await getSystemMode({ signal: controller.signal });
    await getWorkers({ signal: controller.signal });
    await getAlerts({ signal: controller.signal });
    await getIntelligenceExplain({ signal: controller.signal });
    await injectChaos({ type: "cpu_spike", magnitude: 2 }, { signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 6);
  for (const request of requests) {
    assert.equal(request.signal, controller.signal);
  }
  assert.equal(requests[0]?.url, "/internal/system-health");
  assert.equal(requests[1]?.url, "/internal/system-mode");
  assert.equal(requests[2]?.url, "/internal/workers");
  assert.equal(requests[3]?.url, "/internal/alerts");
  assert.equal(requests[4]?.url, "/internal/intelligence/explain");
  assert.equal(requests[5]?.url, "/internal/chaos/inject");
});

test("analytics API wrappers forward AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    const url = String(input);
    if (url === "/api/analytics/summary") {
      return jsonResponse({ totalUsers: 0 });
    }
    if (url === "/api/analytics/login-trends?days=14") {
      return jsonResponse([]);
    }
    if (url === "/api/analytics/top-users?limit=15") {
      return jsonResponse([]);
    }
    if (url === "/api/analytics/peak-hours") {
      return jsonResponse([]);
    }
    if (url === "/api/analytics/role-distribution") {
      return jsonResponse([]);
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await getAnalyticsSummary({ signal: controller.signal });
    await getLoginTrends(14, { signal: controller.signal });
    await getTopActiveUsers(15, { signal: controller.signal });
    await getPeakHours({ signal: controller.signal });
    await getRoleDistribution({ signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 5);
  for (const request of requests) {
    assert.equal(request.signal, controller.signal);
  }
  assert.equal(requests[0]?.url, "/api/analytics/summary");
  assert.equal(requests[1]?.url, "/api/analytics/login-trends?days=14");
  assert.equal(requests[2]?.url, "/api/analytics/top-users?limit=15");
  assert.equal(requests[3]?.url, "/api/analytics/peak-hours");
  assert.equal(requests[4]?.url, "/api/analytics/role-distribution");
});

test("activity API wrappers forward AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    const url = String(input);
    if (url === "/api/activity/all") {
      return jsonResponse({ activities: [] });
    }
    if (url === "/api/activity/filter?status=ONLINE%2CIDLE&username=alice") {
      return jsonResponse({ activities: [] });
    }
    if (url === "/api/users/banned") {
      return jsonResponse({ users: [] });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await getAllActivity({ signal: controller.signal });
    await getFilteredActivity(
      {
        status: ["ONLINE", "IDLE"],
        username: "alice",
      },
      { signal: controller.signal },
    );
    await getBannedUsers({ signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.signal, controller.signal);
  }
  assert.equal(requests[0]?.url, "/api/activity/all");
  assert.equal(requests[1]?.url, "/api/activity/filter?status=ONLINE%2CIDLE&username=alice");
  assert.equal(requests[2]?.url, "/api/users/banned");
});

test("auth manual fetch wrappers forward AbortSignal", async () => {
  const requests: Array<{
    url: string;
    signal: AbortSignal | null;
    body: string | null;
  }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
      body: typeof init?.body === "string" ? init.body : null,
    });

    const url = String(input);
    if (url === "/api/login") {
      return jsonResponse({
        ok: true,
        username: "alice",
        role: "admin",
        activityId: "activity-1",
        mustChangePassword: false,
        status: "active",
        user: null,
      });
    }
    if (url.endsWith("/api/health")) {
      return jsonResponse({ ok: true, live: true, ready: true });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await login(" Alice ", "secret", "fingerprint-1", { signal: controller.signal });
    await checkHealth({ signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.signal, controller.signal);
  assert.equal(requests[1]?.signal, controller.signal);
  assert.equal(requests[0]?.url, "/api/login");
  assert.match(requests[1]?.url || "", /\/api\/health$/);
  assert.deepEqual(JSON.parse(requests[0]?.body || "{}"), {
    username: "alice",
    password: "secret",
    fingerprint: "fingerprint-1",
    browser: navigator.userAgent,
  });
});

test("auth token and password wrappers forward AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    const url = String(input);
    if (url === "/api/auth/validate-activation-token") {
      return jsonResponse({
        ok: true,
        activation: {
          email: "user@example.com",
          expiresAt: "2026-03-24T00:00:00.000Z",
          fullName: "Alice",
          role: "admin",
          username: "alice",
        },
      });
    }
    if (url === "/api/auth/activate-account") {
      return jsonResponse({
        ok: true,
        user: null,
      });
    }
    if (url === "/api/auth/change-password") {
      return jsonResponse({
        ok: true,
        forceLogout: false,
        user: null,
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await validateActivationToken({ token: "token-1" }, { signal: controller.signal });
    await activateAccount(
      {
        token: "token-1",
        newPassword: "Password123!",
        confirmPassword: "Password123!",
      },
      { signal: controller.signal },
    );
    await changeMyPassword(
      {
        currentPassword: "OldPassword123!",
        newPassword: "NewPassword123!",
      },
      { signal: controller.signal },
    );
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 3);
  assert.equal(requests[0]?.signal, controller.signal);
  assert.equal(requests[1]?.signal, controller.signal);
  assert.equal(requests[2]?.signal, controller.signal);
  assert.equal(requests[0]?.url, "/api/auth/validate-activation-token");
  assert.equal(requests[1]?.url, "/api/auth/activate-account");
  assert.equal(requests[2]?.url, "/api/auth/change-password");
});

test("activity heartbeat wrappers forward AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    return new Response(null, { status: 204 });
  }) as typeof fetch);

  try {
    await activityHeartbeat({ activityId: "activity-1" }, { signal: controller.signal });
    await activityHeartbeatLight({ signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.signal, controller.signal);
  assert.equal(requests[1]?.signal, controller.signal);
  assert.equal(requests[0]?.url, "/api/activity/heartbeat");
  assert.equal(requests[1]?.url, "/api/activity/heartbeat");
});

test("searchAI forwards AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    return jsonResponse({
      ai_explanation: "ok",
    });
  }) as typeof fetch);

  try {
    await searchAI("hello", { signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.signal, controller.signal);
  assert.equal(requests[0]?.url, "/api/ai/search");
});

test("search API wrappers forward AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    const url = String(input);
    if (url === "/api/search/global?q=test&page=2&limit=25") {
      return jsonResponse({ results: [], total: 0 });
    }
    if (url === "/api/search/advanced") {
      return jsonResponse({ results: [], total: 0 });
    }
    if (url === "/api/search/columns") {
      return jsonResponse([]);
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await searchData("test", 2, 25, { signal: controller.signal });
    await advancedSearchData(
      [{ field: "name", operator: "contains", value: "alice" }],
      "AND",
      1,
      50,
      { signal: controller.signal },
    );
    await getSearchColumns({ signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.signal, controller.signal);
  }
  assert.equal(requests[0]?.url, "/api/search/global?q=test&page=2&limit=25");
  assert.equal(requests[1]?.url, "/api/search/advanced");
  assert.equal(requests[2]?.url, "/api/search/columns");
});

test("getMaintenanceStatus forwards AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    return jsonResponse({
      maintenance: false,
      message: "",
      type: "soft",
    });
  }) as typeof fetch);

  try {
    await getMaintenanceStatus({ signal: controller.signal });
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.signal, controller.signal);
  assert.equal(requests[0]?.url, "/api/maintenance-status");
});
