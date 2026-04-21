import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@shared/error-codes";
import {
  ApiRequestError,
  apiRequest,
  createApiHeaders,
  createApiRequestId,
} from "./api-client";
import {
  getQueryFn,
  resolveDefaultQueryStaleTime,
  shouldRetrySafeQueryFailure,
} from "./queryClient";

async function withNavigatorOnlineState(
  online: boolean,
  run: () => Promise<void>,
) {
  const navigatorObject = globalThis.navigator as Navigator & { onLine?: boolean };
  const existingDescriptor = Object.getOwnPropertyDescriptor(navigatorObject, "onLine");

  Object.defineProperty(navigatorObject, "onLine", {
    configurable: true,
    value: online,
  });

  try {
    await run();
  } finally {
    if (existingDescriptor) {
      Object.defineProperty(navigatorObject, "onLine", existingDescriptor);
    } else {
      Object.defineProperty(navigatorObject, "onLine", {
        configurable: true,
        value: undefined,
      });
    }
  }
}

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

test("apiRequest preserves structured backend error codes alongside request ids", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    message: "Forbidden",
    requestId: "server-request-456",
    error: {
      code: ERROR_CODES.PERMISSION_DENIED,
      message: "Forbidden",
    },
  }), {
    status: 403,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": "server-request-456",
    },
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("GET", "/api/test-forbidden"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /PERMISSION_DENIED/);
        assert.match(error.message, /server-request-456/);
        return true;
      },
    );
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

test("apiRequest keeps a fuller sanitized plain-text error detail alongside the concise UI message", async () => {
  const originalFetch = globalThis.fetch;
  const veryLongPlainTextError = `Plain text backend failure ${"detail ".repeat(80)}`;

  globalThis.fetch = (async () => new Response(
    veryLongPlainTextError,
    {
      status: 502,
      headers: {
        "Content-Type": "text/plain",
        "x-request-id": "server-request-long-text",
      },
    },
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("GET", "/api/test-long-plain-text-error"),
      (error: unknown) => {
        assert.ok(error instanceof ApiRequestError);
        assert.match(error.message, /server-request-long-text/);
        assert.ok((error.detail || "").includes("Plain text backend failure"));
        assert.ok((error.detail || "").length > 240);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiRequest normalizes invalid JSON error payloads without exposing raw response text", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response(
    "{not-json",
    {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "server-request-invalid-json",
      },
    },
  )) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("GET", "/api/test-invalid-json-error"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /invalid JSON error response/i);
        assert.match(error.message, /server-request-invalid-json/);
        assert.doesNotMatch(error.message, /\{not-json/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiRequest aborts stalled requests after the configured timeout", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      if (signal?.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }

      signal?.addEventListener(
        "abort",
        () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        },
        { once: true },
      );
    })) as unknown) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("GET", "/api/test-timeout", undefined, { timeoutMs: 10 }),
      /Request timed out after 10ms: GET \/api\/test-timeout/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiRequest preserves caller AbortSignal semantics when the caller aborts first", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  globalThis.fetch = (((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      if (signal?.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }

      signal?.addEventListener(
        "abort",
        () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        },
        { once: true },
      );
    })) as unknown) as typeof fetch;

  try {
    const pendingRequest = apiRequest("GET", "/api/test-abort", undefined, {
      signal: controller.signal,
      timeoutMs: 60_000,
    });
    controller.abort();

    await assert.rejects(
      pendingRequest,
      (error: unknown) => error instanceof DOMException && error.name === "AbortError",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiRequest surfaces an offline-specific message before fetch when the browser is offline", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    await withNavigatorOnlineState(false, async () => {
      await assert.rejects(
        () => apiRequest("GET", "/api/test-offline"),
        /appear to be offline/i,
      );
    });
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("apiRequest normalizes offline fetch failures into a specific offline message", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;

  try {
    await withNavigatorOnlineState(false, async () => {
      await assert.rejects(
        () => apiRequest("GET", "/api/test-offline-failure"),
        /appear to be offline/i,
      );
    });
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

test("getQueryFn forwards the React Query abort signal to fetch", async () => {
  const originalFetch = globalThis.fetch;
  let observedSignal: AbortSignal | null = null;

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    observedSignal = init?.signal ?? null;
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
    await queryFn({
      queryKey: ["/api/system-health"],
      client: undefined as never,
      meta: undefined,
      signal: controller.signal,
      pageParam: undefined,
      direction: undefined,
    });

    assert.equal(observedSignal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getQueryFn normalizes invalid JSON responses into a bounded error message", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response("{not-json", {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": "server-query-invalid-json",
    },
  })) as typeof fetch;

  try {
    const queryFn = getQueryFn<{ ok: boolean }>({ on401: "throw" });

    await assert.rejects(
      async () => {
        await queryFn({
          queryKey: ["/api/query-invalid-json"],
          client: undefined as never,
          meta: undefined,
          signal: new AbortController().signal,
          pageParam: undefined,
          direction: undefined,
        });
      },
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /invalid JSON/i);
        assert.match(error.message, /server-query-invalid-json/);
        assert.match(error.message, /\/api\/query-invalid-json/);
        return true;
      },
    );
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

test("shouldRetrySafeQueryFailure retries only conservative transient query failures", () => {
  assert.equal(shouldRetrySafeQueryFailure(0, new TypeError("Failed to fetch")), true);
  assert.equal(shouldRetrySafeQueryFailure(1, new TypeError("Failed to fetch")), false);
  assert.equal(shouldRetrySafeQueryFailure(0, new ApiRequestError({
    message: "Server unavailable",
    responsePayload: { message: "Server unavailable" },
    status: 503,
  })), true);
  assert.equal(shouldRetrySafeQueryFailure(0, new ApiRequestError({
    message: "Forbidden",
    responsePayload: { message: "Forbidden" },
    status: 403,
  })), false);
});
