import assert from "node:assert/strict";
import test from "node:test";
import { getSearchCollectionHistory } from "../search";

function historyResponse(cards: unknown[]) {
  return {
    items: cards.map((cardNumber, index) => ({
      id: `collection-${index}`, kind: "collection", isHistorical: index === 1,
      cardNumber, paymentDate: "2026-09-18", createdAt: "2026-09-18T04:00:00.000Z",
      amount: "125.00", classificationSource: "automatic", automaticClassification: "cp",
      effectiveStatus: "cp", settlementDate: null, staffNickname: "Synthetic Staff",
      createdByLogin: "fixture.staff", sourceImportName: null, sourceFilename: null,
      purgedAt: null, purgedBy: null,
    })),
    summary: { recordCount: cards.length, activeRecordCount: cards.length - 1,
      historicalRecordCount: 1, poolContributionCount: 0, collectionAmount: "250.00",
      poolAmount: "0.00", totalCoveredAmount: "250.00", effectiveStatus: "cp" },
    page: 2, pageSize: 10, total: 20, totalPages: 2, hasNextPage: false, hasPreviousPage: true,
  };
}

test("history API preserves each exact Card including absent older DTO fields without altering order or pagination", async () => {
  const originalFetch = globalThis.fetch;
  const cards = ["0000123412341111", "4181XXXXXXXX2222", null, undefined, "", "   ", `${"SS".repeat(252)}1234`];
  const payload = historyResponse(cards);
  const signal = new AbortController().signal;
  let requests = 0;
  globalThis.fetch = (async (input, options) => {
    requests++;
    assert.equal(String(input), "/api/search/collection-history?key=synthetic%2Bhistory&page=2&pageSize=10");
    assert.equal(options?.method, "GET");
    assert.equal(options?.credentials, "include");
    assert.ok(options?.signal);
    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await getSearchCollectionHistory("synthetic+history", 2, 10, { signal });
    assert.deepEqual(result, JSON.parse(JSON.stringify(payload)));
    assert.deepEqual(result.items.map((item) => item.cardNumber), cards);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("history API rejects malformed Card without echoing its contents or rendering objects", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const card of [{ privateCard: "DO-NOT-LOG-THIS-CARD" }, 1234, "9".repeat(1_025)]) {
      globalThis.fetch = (async () => new Response(JSON.stringify(historyResponse([card])), {
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
      await assert.rejects(() => getSearchCollectionHistory("synthetic"), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /API contract mismatch/);
        assert.match(error.message, /cardNumber/);
        assert.doesNotMatch(error.message, /DO-NOT-LOG-THIS-CARD|99999999/);
        return true;
      });
    }
  } finally { globalThis.fetch = originalFetch; }
});
