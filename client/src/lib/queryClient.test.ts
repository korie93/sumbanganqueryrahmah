import assert from "node:assert/strict";
import test from "node:test";
import { apiRequest, createApiHeaders, createApiRequestId } from "./api-client";
import { getQueryFn, resolveDefaultQueryStaleTime } from "./queryClient";

test("createApiRequestId returns a non-empty unique identifier", () => {
  const left = createApiRequestId();
  const right = createApiRequestId();

  assert.equal(typeof left, "string");
  assert.equal(typeof right, "string");
  assert.ok(left.length > 8);
  assert.ok(right.length > 8);
  assert.notEqual(left, right);
});

test("createApiHeaders injects request ids and preserves caller supplied ids", () => {
  const generated = createApiHeaders({
    Accept: "application/json",
  });
  assert.equal(generated.accept, "application/json");
  assert.ok(String(generated["x-request-id"] || "").length > 8);

  const preserved = createApiHeaders({
    "x-request-id": "client-specified-123",
  });
  assert.equal(preserved["x-request-id"], "client-specified-123");
});

test("apiRequest injects x-request-id headers and preserves backend request ids on errors", async () => {
  const originalFetch = globalThis.fetch;
  let observedRequestId = "";

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    observedRequestId = String(headers?.["x-request-id"] || "");

    return new Response(JSON.stringify({
      message: "Request failed",
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "server-request-123",
      },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("GET", "/api/test-observability"),
      /server-request-123/,
    );
    assert.ok(observedRequestId.length > 8);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiRequest normalizes oversized HTML error pages into a friendly message", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response(
    "<!DOCTYPE html><html><head><title>413 Request Entity Too Large</title></head><body><h1>413 Request Entity Too Large</h1></body></html>",
    {
      status: 413,
      headers: {
        "Content-Type": "text/html",
      },
    },
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("POST", "/api/imports", { ok: true }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /too large to import/i);
        assert.doesNotMatch(error.message, /<!doctype html|<html/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getQueryFn injects x-request-id headers for query fetches", async () => {
  const originalFetch = globalThis.fetch;
  let observedRequestId = "";

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    observedRequestId = String(headers?.["x-request-id"] || "");

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    const queryFn = getQueryFn<{ ok: boolean }>({ on401: "throw" });
    const controller = new AbortController();
    const payload = await queryFn({
      queryKey: ["/api/health"],
      client: undefined as never,
      meta: undefined,
      signal: controller.signal,
      pageParam: undefined,
      direction: undefined,
    });

    assert.deepEqual(payload, { ok: true });
    assert.ok(observedRequestId.length > 8);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolveDefaultQueryStaleTime tunes query freshness by endpoint profile", () => {
  assert.equal(resolveDefaultQueryStaleTime(["/api/health/live"]), 15_000);
  assert.equal(resolveDefaultQueryStaleTime(["/api/analytics/summary"]), 30_000);
  assert.equal(resolveDefaultQueryStaleTime(["/api/settings"]), 90_000);
  assert.equal(resolveDefaultQueryStaleTime(["/api/collection/list"]), 60_000);
});
