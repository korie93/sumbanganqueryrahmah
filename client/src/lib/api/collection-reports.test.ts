import assert from "node:assert/strict";
import test from "node:test";
import {
  getCollectionMonthlyComparison,
  getCollectionNicknameSummary,
} from "./collection-reports";
import { getCollectionNicknames } from "./collection-nicknames";

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
