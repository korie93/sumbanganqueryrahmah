import assert from "node:assert/strict";
import test from "node:test";
import { CircuitOpenError } from "../../internal/circuitBreaker";
import {
  buildAiSearchResolveErrorResponse,
  getFreshLastAiPerson,
  getFreshTimedCacheEntry,
  getOrCreateAiSearchInflight,
  isAiSearchTimeoutError,
  releaseAiSearchInflightIfCurrent,
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
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

test("AI search timeout helpers identify only bounded timeout failures", () => {
  assert.equal(isAiSearchTimeoutError(new Error("timeout")), true);
  assert.equal(isAiSearchTimeoutError(new Error("Timeout")), false);
  assert.equal(isAiSearchTimeoutError("timeout"), false);
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

test("timed-out AI search inflight releases without letting stale work overwrite newer work", async () => {
  const inflight = new Map<string, Promise<AiSearchResult>>();
  const cache = new Map<string, { ts: number; payload: unknown; audit: AiSearchAudit }>();
  const firstDeferred = createDeferred<AiSearchResult>();
  const secondDeferred = createDeferred<AiSearchResult>();
  const firstResult = {
    payload: { source: "first" },
    audit: createAudit(),
  };
  const secondResult = {
    payload: { source: "second" },
    audit: createAudit(),
  };
  let computeCalls = 0;

  const first = getOrCreateAiSearchInflight({
    cacheKey: "search:ali",
    inflight,
    cache,
    compute: () => {
      computeCalls += 1;
      return firstDeferred.promise;
    },
    maxCacheEntries: 5,
    now: () => 100,
  });

  assert.equal(
    releaseAiSearchInflightIfCurrent({
      cacheKey: "search:ali",
      inflight,
      promise: first,
    }),
    true,
  );
  assert.equal(inflight.has("search:ali"), false);

  const second = getOrCreateAiSearchInflight({
    cacheKey: "search:ali",
    inflight,
    cache,
    compute: () => {
      computeCalls += 1;
      return secondDeferred.promise;
    },
    maxCacheEntries: 5,
    now: () => 200,
  });

  assert.equal(computeCalls, 2);
  firstDeferred.resolve(firstResult);
  await first;
  assert.equal(inflight.get("search:ali"), second);
  assert.equal(cache.has("search:ali"), false);

  secondDeferred.resolve(secondResult);
  await second;
  assert.equal(inflight.has("search:ali"), false);
  assert.deepEqual(cache.get("search:ali"), {
    ts: 200,
    payload: { source: "second" },
    audit: createAudit(),
  });
});

test("AI search inflight release ignores stale promise handles", async () => {
  const inflight = new Map<string, Promise<AiSearchResult>>();
  const cache = new Map<string, { ts: number; payload: unknown; audit: AiSearchAudit }>();
  const active = Promise.resolve({ payload: { active: true }, audit: createAudit() });
  const stale = Promise.resolve({ payload: { stale: true }, audit: createAudit() });
  inflight.set("search:ali", active);

  assert.equal(
    releaseAiSearchInflightIfCurrent({
      cacheKey: "search:ali",
      inflight,
      promise: stale,
    }),
    false,
  );
  assert.equal(inflight.get("search:ali"), active);

  await getOrCreateAiSearchInflight({
    cacheKey: "search:other",
    inflight,
    cache,
    compute: () => Promise.resolve({ payload: { ok: true }, audit: createAudit() }),
    maxCacheEntries: 5,
  });
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
