import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES } from "@shared/error-codes";
import {
  ApiCircuitOpenError,
  apiRequest,
  createApiHeaders,
  createApiRequestId,
  getApiErrorRetryCount,
  getApiRetryCircuitSnapshotForTests,
  getApiResponseRetryCount,
  resetApiRetryStateForTests,
} from "./api-client";
import { getQueryFn, resolveDefaultQueryStaleTime } from "./queryClient";

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
      () => apiRequest("GET", "/api/test-observability", undefined, { retry: false }),
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

test("apiRequest retries transient gateway failures before returning success", async () => {
  const originalFetch = globalThis.fetch;
  resetApiRetryStateForTests();
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response(JSON.stringify({ message: "temporary outage" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await apiRequest("GET", "/api/test-retry-success", undefined, {
      retry: {
        baseDelayMs: 1,
        jitterRatio: 0,
        maxRetries: 3,
      },
    });

    assert.equal(callCount, 2);
    assert.equal(response.status, 200);
    assert.equal(getApiResponseRetryCount(response), 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetApiRetryStateForTests();
  }
});

test("apiRequest exposes retry count after exhausting retryable responses", async () => {
  const originalFetch = globalThis.fetch;
  resetApiRetryStateForTests();
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify({ message: "temporarily unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("GET", "/api/test-retry-failure", undefined, {
        retry: {
          baseDelayMs: 1,
          jitterRatio: 0,
          maxRetries: 3,
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /temporarily unavailable/);
        assert.equal(getApiErrorRetryCount(error), 3);
        return true;
      },
    );
    assert.equal(callCount, 4);
  } finally {
    globalThis.fetch = originalFetch;
    resetApiRetryStateForTests();
  }
});

test("apiRequest does not retry authentication failures", async () => {
  const originalFetch = globalThis.fetch;
  resetApiRetryStateForTests();
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify({ message: "Token required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("GET", "/api/test-auth-failure", undefined, {
        retry: {
          baseDelayMs: 1,
          jitterRatio: 0,
          maxRetries: 3,
        },
      }),
      /Token required/,
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetApiRetryStateForTests();
  }
});

test("apiRequest does not retry non-idempotent mutations after gateway failures", async () => {
  const originalFetch = globalThis.fetch;
  resetApiRetryStateForTests();
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify({ message: "upstream unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("POST", "/api/imports", new FormData()),
      /upstream unavailable/,
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetApiRetryStateForTests();
  }
});

test("apiRequest aborts the retry chain when the caller signal aborts during backoff", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  resetApiRetryStateForTests();
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    setTimeout(() => controller.abort(), 0);
    return new Response(JSON.stringify({ message: "temporarily unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("GET", "/api/test-retry-abort", undefined, {
        retry: {
          baseDelayMs: 50,
          jitterRatio: 0,
          maxRetries: 3,
        },
        signal: controller.signal,
      }),
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetApiRetryStateForTests();
  }
});

test("apiRequest retry circuit opens after repeated transient failures", async () => {
  const originalFetch = globalThis.fetch;
  resetApiRetryStateForTests();
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify({ message: "temporarily unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    for (let index = 0; index < 5; index += 1) {
      await assert.rejects(
        () => apiRequest("GET", `/api/test-circuit-${index}`, undefined, { retry: false }),
        /temporarily unavailable/,
      );
    }

    const beforeCircuitAttempt = callCount;
    await assert.rejects(
      () => apiRequest("GET", "/api/test-circuit-open", undefined, {
        retry: {
          baseDelayMs: 1,
          jitterRatio: 0,
          maxRetries: 3,
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof ApiCircuitOpenError);
        assert.ok(error.retryAfterMs > 29_000 && error.retryAfterMs <= 30_000);
        return true;
      },
    );
    assert.equal(callCount - beforeCircuitAttempt, 0);
    assert.equal(getApiRetryCircuitSnapshotForTests().phase, "OPEN");
  } finally {
    globalThis.fetch = originalFetch;
    resetApiRetryStateForTests();
  }
});

test("apiRequest retry circuit recovers through half-open probes", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;
  let nowMs = 1_000;
  t.mock.method(Date, "now", () => nowMs);
  resetApiRetryStateForTests();

  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "temporarily unavailable" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;

  try {
    for (let index = 0; index < 5; index += 1) {
      await assert.rejects(
        () => apiRequest("GET", `/api/test-half-open-failure-${index}`, undefined, { retry: false }),
        /temporarily unavailable/,
      );
    }
    assert.equal(getApiRetryCircuitSnapshotForTests().phase, "OPEN");

    nowMs += 31_000;
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

    await apiRequest("GET", "/api/test-half-open-success-1", undefined, {
      retry: { baseDelayMs: 1, jitterRatio: 0, maxRetries: 3 },
    });
    assert.deepEqual(
      {
        halfOpenSuccesses: getApiRetryCircuitSnapshotForTests().halfOpenSuccesses,
        phase: getApiRetryCircuitSnapshotForTests().phase,
      },
      { halfOpenSuccesses: 1, phase: "HALF_OPEN" },
    );

    await apiRequest("GET", "/api/test-half-open-success-2", undefined, {
      retry: { baseDelayMs: 1, jitterRatio: 0, maxRetries: 3 },
    });
    assert.equal(getApiRetryCircuitSnapshotForTests().phase, "CLOSED");
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalDateNow;
    resetApiRetryStateForTests();
  }
});

test("apiRequest retry circuit reopens when a half-open probe fails", async (t) => {
  const originalFetch = globalThis.fetch;
  let nowMs = 1_000;
  t.mock.method(Date, "now", () => nowMs);
  resetApiRetryStateForTests();

  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "temporarily unavailable" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;

  try {
    for (let index = 0; index < 5; index += 1) {
      await assert.rejects(
        () => apiRequest("GET", `/api/test-half-open-reopen-${index}`, undefined, { retry: false }),
        /temporarily unavailable/,
      );
    }

    nowMs += 31_000;
    await assert.rejects(
      () => apiRequest("GET", "/api/test-half-open-reopen-probe", undefined, {
        retry: { baseDelayMs: 1, jitterRatio: 0, maxRetries: 3 },
      }),
      /temporarily unavailable/,
    );

    const snapshot = getApiRetryCircuitSnapshotForTests();
    assert.equal(snapshot.phase, "OPEN");
    assert.equal(snapshot.halfOpenSuccesses, 0);
  } finally {
    globalThis.fetch = originalFetch;
    resetApiRetryStateForTests();
  }
});

test("apiRequest ignores unvalidated JSON error flags instead of acting on them", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const dispatchedEvents: string[] = [];
  const eventTarget = new EventTarget();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent(event: Event) {
        dispatchedEvents.push(event.type);
        return eventTarget.dispatchEvent(event);
      },
    },
  });

  globalThis.fetch = (async () => new Response(JSON.stringify({
    forceLogout: true,
  }), {
    status: 403,
    statusText: "Forbidden",
    headers: {
      "Content-Type": "application/json",
    },
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => apiRequest("GET", "/api/test-invalid-error-payload"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Permintaan tidak dapat diselesaikan/);
        assert.doesNotMatch(error.message, /forceLogout/);
        return true;
      },
    );
    assert.deepEqual(dispatchedEvents, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
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

test("getQueryFn rejects malformed JSON through the bounded API reader", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response("{bad-json", {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  })) as typeof fetch;

  try {
    const queryFn = getQueryFn<{ ok: boolean }>({ on401: "throw" });
    const controller = new AbortController();

    await assert.rejects(
      async () => queryFn({
        queryKey: ["/api/health"],
        client: undefined as never,
        meta: undefined,
        signal: controller.signal,
        pageParam: undefined,
        direction: undefined,
      }),
      /API response JSON parse failed for \/api\/health/,
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
