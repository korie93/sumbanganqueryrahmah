import assert from "node:assert/strict";
import test from "node:test";
import { CircuitOpenError } from "../../internal/circuitBreaker";
import {
  buildAiSearchResolveErrorResponse,
  getFreshLastAiPerson,
  getFreshTimedCacheEntry,
  getOrCreateAiSearchInflight,
  resolveAiSearchRequestTimeoutMs,
  shouldLogAiSearchResolveError,
  sweepTimedCacheEntries,
  withTimeout,
} from "../ai-search-runtime-utils";
import type { AiIntent, AiSearchAudit, AiSearchCandidateRow, AiSearchResult } from "../ai-search-types";

function createCandidate(rowId: string): AiSearchCandidateRow {
  return {
    rowId,
    jsonDataJsonb: { Nama: "Ali" },
  } as AiSearchCandidateRow;
}

function createAudit(): AiSearchAudit {
  return {
    query: "ali",
    intent: {
      intent: "search_person",
      entities: {
        name: "Ali",
        ic: null,
        account_no: null,
        phone: null,
        address: null,
        count_groups: null,
      },
      need_nearest_branch: false,
    } satisfies AiIntent,
    matched_profile_id: null,
    branch: null,
    distance_km: null,
    decision: null,
    travel_mode: null,
    estimated_minutes: null,
    used_last_person: false,
  };
}

test("timed cache helpers return fresh entries and evict stale or excess ones", () => {
  const cache = new Map<string, { ts: number; value: string }>([
    ["stale", { ts: 10, value: "old" }],
    ["fresh-a", { ts: 90, value: "a" }],
    ["fresh-b", { ts: 95, value: "b" }],
  ]);

  assert.equal(getFreshTimedCacheEntry(cache, "fresh-a", 20, 100)?.value, "a");
  assert.equal(getFreshTimedCacheEntry(cache, "stale", 20, 100), null);

  sweepTimedCacheEntries(cache, 20, 1, 100);
  assert.deepEqual(Array.from(cache.keys()), ["fresh-b"]);
});

test("getFreshLastAiPerson keeps fresh rows and drops expired session context", () => {
  const cache = new Map<string, { ts: number; row: AiSearchCandidateRow }>([
    ["fresh", { ts: 90, row: createCandidate("row-fresh") }],
    ["stale", { ts: 10, row: createCandidate("row-stale") }],
  ]);

  assert.equal(getFreshLastAiPerson(cache, "fresh", 20, 100)?.rowId, "row-fresh");
  assert.equal(getFreshLastAiPerson(cache, "stale", 20, 100), null);
  assert.equal(cache.has("stale"), false);
});

test("withTimeout resolves successful promises and rejects timeouts", async () => {
  await assert.doesNotReject(() => withTimeout(Promise.resolve("ok"), 100));
  await assert.rejects(() => withTimeout(new Promise(() => {}), 1), /timeout/);
});

test("resolveAiSearchRequestTimeoutMs leaves room for post-processing work", () => {
  assert.equal(resolveAiSearchRequestTimeoutMs(1000), 2500);
  assert.equal(resolveAiSearchRequestTimeoutMs(6000), 7800);
  assert.equal(resolveAiSearchRequestTimeoutMs(15000), 18000);
});

test("getOrCreateAiSearchInflight dedupes concurrent work and writes cache once", async () => {
  const inflight = new Map<string, Promise<AiSearchResult>>();
  const cache = new Map<string, { ts: number; payload: unknown; audit: AiSearchAudit }>();
  let computeCalls = 0;

  const compute = async (): Promise<AiSearchResult> => {
    computeCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      payload: { ok: true },
      audit: createAudit(),
    };
  };

  const first = getOrCreateAiSearchInflight({
    cacheKey: "search:ali",
    inflight,
    cache,
    compute,
    maxCacheEntries: 5,
    now: () => 123,
  });
  const second = getOrCreateAiSearchInflight({
    cacheKey: "search:ali",
    inflight,
    cache,
    compute,
    maxCacheEntries: 5,
    now: () => 123,
  });

  const [a, b] = await Promise.all([first, second]);
  assert.equal(computeCalls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(cache.get("search:ali"), {
    ts: 123,
    payload: { ok: true },
    audit: createAudit(),
  });
  assert.equal(inflight.size, 0);
});

test("AI search error helpers keep circuit-open and processing fallback responses stable", () => {
  const circuitResponse = buildAiSearchResolveErrorResponse(new CircuitOpenError("ai-search"));
  const genericResponse = buildAiSearchResolveErrorResponse(new Error("boom"));

  assert.equal(circuitResponse.statusCode, 503);
  assert.equal((circuitResponse.body as { circuit?: string }).circuit, "OPEN");
  assert.equal(genericResponse.statusCode, 200);
  assert.equal((genericResponse.body as { processing?: boolean }).processing, true);
  assert.equal(shouldLogAiSearchResolveError(new CircuitOpenError("ai-search")), false);
  assert.equal(shouldLogAiSearchResolveError(new Error("timeout")), false);
  assert.equal(shouldLogAiSearchResolveError(new Error("boom")), true);
});
