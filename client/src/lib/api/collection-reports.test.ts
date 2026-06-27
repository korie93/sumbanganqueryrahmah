import assert from "node:assert/strict";
import test from "node:test";
import {
  getCollectionMonthlyComparison,
  getCollectionMonthlySummary,
  getCollectionMonthlyTarget,
  getCollectionNicknameSummary,
} from "./collection-reports";
import { getCollectionNicknames } from "./collection-nicknames";

test("getCollectionMonthlySummary validates rows and forwards nickname filters", async () => {
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response(
      JSON.stringify({
        ok: true,
        year: 2026,
        summary: [
          { month: 1, monthName: "January", totalRecords: 2, totalAmount: 300 },
          { month: 2, monthName: "February", totalRecords: 1, totalAmount: 150.5 },
        ],
        freshness: {
          status: "fresh",
          pendingCount: 0,
          runningCount: 0,
          retryCount: 0,
          oldestPendingAgeMs: 0,
          message: "Collection report is current.",
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const payload = await getCollectionMonthlySummary({
      year: 2026,
      nicknames: ["Collector Alpha", "Collector Beta"],
    });
    assert.equal(payload.summary[1]?.totalAmount, 150.5);
    assert.equal(payload.freshness?.status, "fresh");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(
    requests[0] || "",
    /\/api\/collection\/summary\?year=2026&nicknames=Collector\+Alpha%2CCollector\+Beta$/,
  );
});

test("getCollectionMonthlySummary rejects malformed amount payloads", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    JSON.stringify({
      ok: true,
      year: 2026,
      summary: [{
        month: 1,
        monthName: "January",
        totalRecords: 2,
        totalAmount: "300.00",
      }],
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  )) as typeof fetch;

  try {
    await assert.rejects(
      getCollectionMonthlySummary({ year: 2026 }),
      /API contract mismatch for \/api\/collection\/summary/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getCollectionNicknameSummary forwards query params and AbortSignal", async () => {
  const requests: Array<{ input: string; signal: AbortSignal | null }> = [];
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      input: String(input),
      signal: init?.signal || null,
    });
    return new Response(
      JSON.stringify({
        ok: true,
        nicknames: ["Collector Alpha"],
        totalRecords: 1,
        totalAmount: 55,
        page: 2,
        pageSize: 25,
        limit: 25,
        offset: 25,
        pagination: {
          mode: "hybrid",
          page: 2,
          pageSize: 25,
          total: 1,
          totalPages: 1,
          limit: 25,
          offset: 25,
          nextCursor: null,
          hasNextPage: false,
          hasPreviousPage: true,
        },
        nicknameTotals: [],
        records: [],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const payload = await getCollectionNicknameSummary(
      {
        from: "2026-03-01",
        to: "2026-03-31",
        nicknames: ["Collector Alpha"],
        summaryOnly: true,
        page: 2,
        pageSize: 25,
      },
      { signal: controller.signal },
    );
    assert.equal(payload.pagination.total, 1);
    assert.equal(payload.pagination.pageSize, 25);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.match(
    requests[0]?.input || "",
    /\/api\/collection\/nickname-summary\?from=2026-03-01&to=2026-03-31&nicknames=Collector\+Alpha&summaryOnly=1&page=2&pageSize=25$/,
  );
  assert.equal(requests[0]?.signal, controller.signal);
});

test("getCollectionNicknames forwards includeInactive and AbortSignal", async () => {
  const requests: Array<{ input: string; signal: AbortSignal | null }> = [];
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      input: String(input),
      signal: init?.signal || null,
    });
    return new Response(
      JSON.stringify({
        ok: true,
        nicknames: [],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    await getCollectionNicknames(
      { includeInactive: true },
      { signal: controller.signal },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.match(
    requests[0]?.input || "",
    /\/api\/collection\/nicknames\?includeInactive=1$/,
  );
  assert.equal(requests[0]?.signal, controller.signal);
});

test("getCollectionNicknameSummary rejects malformed target benchmark payloads", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response(
    JSON.stringify({
      ok: true,
      nicknames: ["Collector Alpha"],
      totalRecords: 1,
      totalAmount: 55,
      page: 1,
      pageSize: 25,
      limit: 25,
      offset: 0,
      pagination: {
        mode: "hybrid",
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
        limit: 25,
        offset: 0,
        nextCursor: null,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      nicknameTotals: [{
        nickname: "Collector Alpha",
        totalRecords: 1,
        totalAmount: 55,
        targetBenchmark: {
          amount: "62000",
          configuredMonths: 1,
          missingMonths: 0,
          requestedMonths: 1,
        },
      }],
      records: [],
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  )) as typeof fetch;

  try {
    await assert.rejects(
      getCollectionNicknameSummary({ nicknames: ["Collector Alpha"] }),
      /API contract mismatch for \/api\/collection\/nickname-summary/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getCollectionMonthlyComparison forwards nickname, month range, and AbortSignal", async () => {
  const requests: Array<{ input: string; signal: AbortSignal | null }> = [];
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      input: String(input),
      signal: init?.signal || null,
    });
    return new Response(
      JSON.stringify({
        ok: true,
        nickname: "Collector Alpha",
        startMonth: "2026-04",
        endMonth: "2026-05",
        months: [
          {
            month: "2026-04",
            label: "Apr 2026",
            totalCollection: 70450,
            recordCount: 123,
            averagePerRecord: 572.76,
          },
          {
            month: "2026-05",
            label: "May 2026",
            totalCollection: 82900,
            recordCount: 146,
            averagePerRecord: 567.81,
          },
        ],
        comparison: {
          baseMonth: "2026-04",
          targetMonth: "2026-05",
          baseLabel: "Apr 2026",
          targetLabel: "May 2026",
          baseTotal: 70450,
          targetTotal: 82900,
          difference: 12450,
          percentageChange: 17.67,
          direction: "increase",
          summary: "Collection increased by RM12,450.00 (+17.67%) compared to Apr 2026.",
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const payload = await getCollectionMonthlyComparison(
      {
        nickname: "Collector Alpha",
        startMonth: "2026-04",
        endMonth: "2026-05",
      },
      { signal: controller.signal },
    );
    assert.equal(payload.nickname, "Collector Alpha");
    assert.equal(payload.months.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.match(
    requests[0]?.input || "",
    /\/api\/collection\/monthly-comparison\?nickname=Collector\+Alpha&startMonth=2026-04&endMonth=2026-05$/,
  );
  assert.equal(requests[0]?.signal, controller.signal);
});

test("getCollectionMonthlyTarget forwards nickname, month, and AbortSignal", async () => {
  const requests: Array<{ input: string; signal: AbortSignal | null }> = [];
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      input: String(input),
      signal: init?.signal || null,
    });
    return new Response(
      JSON.stringify({
        ok: true,
        nickname: "Collector Alpha",
        month: {
          key: "2026-05",
          year: 2026,
          month: 5,
        },
        monthlyTarget: 80000,
        configured: true,
        source: "configured",
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const payload = await getCollectionMonthlyTarget(
      {
        nickname: "Collector Alpha",
        month: "2026-05",
      },
      { signal: controller.signal },
    );
    assert.equal(payload.nickname, "Collector Alpha");
    assert.equal(payload.monthlyTarget, 80000);
    assert.equal(payload.configured, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.match(
    requests[0]?.input || "",
    /\/api\/collection\/monthly-target\?nickname=Collector\+Alpha&month=2026-05$/,
  );
  assert.equal(requests[0]?.signal, controller.signal);
});
