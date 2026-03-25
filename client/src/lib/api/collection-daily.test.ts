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
