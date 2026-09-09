import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  fetchApiWithRetry,
  getApiResponseRetryCount,
  resetApiRetryStateForTests,
} from "./api-client-retry";

function mockRetryResponses(t: TestContext, retryAfter: string) {
  const delays: number[] = [];
  let requests = 0;
  resetApiRetryStateForTests();
  t.after(resetApiRetryStateForTests);
  t.mock.method(globalThis, "fetch", async () => {
    requests += 1;
    return requests === 1
      ? new Response("rate limited", { status: 429, headers: { "Retry-After": retryAfter } })
      : new Response("ok");
  });
  t.mock.method(globalThis, "setTimeout", (callback: () => void, delay: number) => {
    delays.push(delay);
    queueMicrotask(callback);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  });
  return { delays, requests: () => requests };
}

test("429 Retry-After is a minimum and is never shortened by negative jitter", async (t) => {
  const observed = mockRetryResponses(t, "10");
  t.mock.method(Math, "random", () => 0);
  const response = await fetchApiWithRetry("/api/analytics/summary");

  assert.equal(response.status, 200);
  assert.equal(observed.requests(), 2);
  assert.deepEqual(observed.delays, [10_000]);
  assert.equal(getApiResponseRetryCount(response), 1);
});

test("429 retries add only positive jitter after the server cooldown", async (t) => {
  const observed = mockRetryResponses(t, "10");
  t.mock.method(Math, "random", () => 0.5);
  await fetchApiWithRetry("/api/settings/tab-visibility");

  assert.deepEqual(observed.delays, [10_500]);
});

test("429 with a cooldown longer than the automatic retry budget returns without retrying early", async (t) => {
  const observed = mockRetryResponses(t, "900");
  const response = await fetchApiWithRetry("/api/settings/tab-visibility");

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "900");
  assert.equal(observed.requests(), 1);
  assert.deepEqual(observed.delays, []);
  assert.equal(getApiResponseRetryCount(response), 0);
});

test("429 HTTP-date Retry-After is honored within the bounded retry delay", async (t) => {
  const now = Date.UTC(2026, 0, 1);
  t.mock.method(Date, "now", () => now);
  t.mock.method(Math, "random", () => 0);
  const observed = mockRetryResponses(t, new Date(now + 20_000).toUTCString());
  await fetchApiWithRetry("/api/app-config");

  assert.deepEqual(observed.delays, [20_000]);
});

test("429 Retry-After at the delay cap never exceeds the configured bounded wait", async (t) => {
  const observed = mockRetryResponses(t, "30");
  t.mock.method(Math, "random", () => 1);
  await fetchApiWithRetry("/api/collection/daily/overview");

  assert.deepEqual(observed.delays, [30_000]);
});

test("429 Retry-After zero still observes bounded exponential backoff", async (t) => {
  const observed = mockRetryResponses(t, "0");
  await fetchApiWithRetry("/api/analytics/summary", undefined, {
    retry: { jitterRatio: 0, baseDelayMs: 1_000 },
  });

  assert.deepEqual(observed.delays, [1_000]);
});
