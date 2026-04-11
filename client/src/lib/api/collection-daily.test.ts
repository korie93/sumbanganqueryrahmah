import assert from "node:assert/strict";
import test from "node:test";
import {
  getCollectionDailyDayDetails,
  getCollectionDailyOverview,
  getCollectionDailyUsers,
} from "./collection-daily";

test("getCollectionDailyUsers forwards AbortSignal", async () => {
  const requests: Array<{ input: string; signal: AbortSignal | null }> = [];
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      input: String(input),
      signal: init?.signal || null,
    });
    return new Response(JSON.stringify({ ok: true, users: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await getCollectionDailyUsers({ signal: controller.signal });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.match(requests[0]?.input || "", /\/api\/collection\/daily\/users$/);
  assert.equal(requests[0]?.signal, controller.signal);
});

test("getCollectionDailyUsers filters malformed user rows safely", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        users: [
          { id: "1", username: "Collector Alpha", role: "admin" },
          { id: "2", username: "", role: "user" },
          { id: "3", role: "user" },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const response = await getCollectionDailyUsers();
    assert.deepEqual(response.users, [
      {
        id: "1",
        username: "Collector Alpha",
        role: "admin",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getCollectionDailyOverview forwards query params and AbortSignal", async () => {
  const requests: Array<{ input: string; signal: AbortSignal | null }> = [];
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      input: String(input),
      signal: init?.signal || null,
    });
    return new Response(JSON.stringify({ ok: true, summary: {}, days: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await getCollectionDailyOverview(
      {
        year: 2026,
        month: 3,
        usernames: ["Collector Alpha", "Collector Beta"],
      },
      { signal: controller.signal },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.match(
    requests[0]?.input || "",
    /\/api\/collection\/daily\/overview\?year=2026&month=3&usernames=Collector\+Alpha%2CCollector\+Beta$/,
  );
  assert.equal(requests[0]?.signal, controller.signal);
});

test("getCollectionDailyOverview normalizes malformed payloads into a safe shape", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        ok: "yes",
        usernames: ["Collector Alpha"],
        summary: {
          monthlyTarget: "123.45",
        },
        days: [
          {
            day: "2",
            amount: "11.1",
            target: "30",
            customerCount: "3",
            status: "broken",
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const response = await getCollectionDailyOverview({ year: 2026, month: 3 });
    assert.equal(response.ok, true);
    assert.equal(response.username, "Collector Alpha");
    assert.equal(response.month.year, 2026);
    assert.equal(response.month.month, 3);
    assert.equal(response.summary.monthlyTarget, 123.45);
    assert.equal(response.days[0]?.date, "2026-03-02");
    assert.equal(response.days[0]?.customerCount, 3);
    assert.equal(response.days[0]?.status, "neutral");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getCollectionDailyDayDetails forwards paging params and AbortSignal", async () => {
  const requests: Array<{ input: string; signal: AbortSignal | null }> = [];
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      input: String(input),
      signal: init?.signal || null,
    });
    return new Response(JSON.stringify({ ok: true, records: [], pagination: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await getCollectionDailyDayDetails(
      {
        date: "2026-03-24",
        usernames: ["Collector Alpha"],
        page: 2,
        pageSize: 10,
      },
      { signal: controller.signal },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.match(
    requests[0]?.input || "",
    /\/api\/collection\/daily\/day-details\?date=2026-03-24&usernames=Collector\+Alpha&page=2&pageSize=10$/,
  );
  assert.equal(requests[0]?.signal, controller.signal);
});

test("getCollectionDailyDayDetails normalizes malformed payloads into a safe shape", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        usernames: ["Collector Alpha"],
        records: [
          {
            id: "rec-1",
            customerName: "Aminah",
            accountNumber: "ACC-1",
            amount: "15.75",
            receipts: [
              {
                originalFileName: "receipt-1.jpg",
              },
            ],
          },
        ],
        pagination: {
          page: "3",
          pageSize: "10",
          totalRecords: "25",
          totalPages: "3",
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const response = await getCollectionDailyDayDetails({ date: "2026-03-24" });
    assert.equal(response.username, "Collector Alpha");
    assert.equal(response.pagination.page, 3);
    assert.equal(response.pagination.totalRecords, 25);
    assert.equal(response.records[0]?.paymentDate, "2026-03-24");
    assert.equal(response.records[0]?.paymentReference, "ACC-1");
    assert.equal(response.records[0]?.receipts[0]?.originalFileName, "receipt-1.jpg");
    assert.equal(response.records[0]?.receipts[0]?.originalMimeType, "application/octet-stream");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
