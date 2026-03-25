import assert from "node:assert/strict";
import test from "node:test";
import { getCollectionNicknameSummary } from "./collection-reports";
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
    await getCollectionNicknameSummary(
      {
        from: "2026-03-01",
        to: "2026-03-31",
        nicknames: ["Collector Alpha"],
        summaryOnly: true,
      },
      { signal: controller.signal },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.match(
    requests[0]?.input || "",
    /\/api\/collection\/nickname-summary\?from=2026-03-01&to=2026-03-31&nicknames=Collector\+Alpha&summaryOnly=1$/,
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
