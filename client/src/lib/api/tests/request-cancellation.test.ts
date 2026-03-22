import assert from "node:assert/strict";
import test from "node:test";
import {
  getDevMailOutboxPreviews,
  getPendingPasswordResetRequests,
  getSuperuserManagedUsers,
} from "@/lib/api/auth";
import { getCollectionRecords } from "@/lib/api/collection";

function withMockFetch(mock: typeof fetch): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

test("admin list API wrappers forward query params and AbortSignal", async () => {
  const requests: Array<{ url: string; signal: AbortSignal | null }> = [];
  const controller = new AbortController();
  const restoreFetch = withMockFetch((async (input, init) => {
    requests.push({
      url: String(input),
      signal: (init?.signal as AbortSignal | undefined) || null,
    });

    const url = String(input);
    if (url.startsWith("/api/admin/users")) {
      return jsonResponse({
        ok: true,
        users: [],
        pagination: { page: 2, pageSize: 20, total: 0, totalPages: 1 },
      });
    }
    if (url.startsWith("/api/admin/password-reset-requests")) {
      return jsonResponse({
        ok: true,
        requests: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
      });
    }
    if (url.startsWith("/api/admin/dev-mail-outbox")) {
      return jsonResponse({
        ok: true,
        enabled: true,
        previews: [],
        pagination: { page: 3, pageSize: 15, total: 0, totalPages: 1 },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await getSuperuserManagedUsers(
      {
        page: 2,
        pageSize: 20,
        search: "alice",
        role: "admin",
        status: "active",
      },
      { signal: controller.signal },
    );
    await getPendingPasswordResetRequests(
      {
        page: 1,
        pageSize: 10,
        search: "bob",
        status: "pending_activation",
      },
      { signal: controller.signal },
    );
    await getDevMailOutboxPreviews(
      {
        page: 3,
        pageSize: 15,
        searchEmail: "dev@example.com",
        searchSubject: "reset",
        sortDirection: "asc",
      },
      { signal: controller.signal },
    );
  } finally {
    restoreFetch();
  }

  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.signal, controller.signal);
  }

  const managedParams = new URL(`http://localhost${requests[0]?.url || ""}`).searchParams;
  assert.equal(managedParams.get("page"), "2");
  assert.equal(managedParams.get("pageSize"), "20");
  assert.equal(managedParams.get("search"), "alice");
  assert.equal(managedParams.get("role"), "admin");
  assert.equal(managedParams.get("status"), "active");

  const pendingParams = new URL(`http://localhost${requests[1]?.url || ""}`).searchParams;
  assert.equal(pendingParams.get("page"), "1");
  assert.equal(pendingParams.get("pageSize"), "10");
  assert.equal(pendingParams.get("search"), "bob");
  assert.equal(pendingParams.get("status"), "pending_activation");

  const outboxParams = new URL(`http://localhost${requests[2]?.url || ""}`).searchParams;
  assert.equal(outboxParams.get("page"), "3");
  assert.equal(outboxParams.get("pageSize"), "15");
  assert.equal(outboxParams.get("searchEmail"), "dev@example.com");
  assert.equal(outboxParams.get("searchSubject"), "reset");
  assert.equal(outboxParams.get("sortDirection"), "asc");
});

test("getCollectionRecords forwards AbortSignal and rejects on abort", async () => {
  const controller = new AbortController();
  const restoreFetch = withMockFetch(((_input, init) => {
    return new Promise<Response>((resolve, reject) => {
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

      setTimeout(() => {
        resolve(
          jsonResponse({
            ok: true,
            records: [],
            total: 0,
            totalAmount: 0,
            limit: 10,
            offset: 0,
          }),
        );
      }, 50);
    });
  }) as typeof fetch);

  try {
    const pendingRequest = getCollectionRecords(
      {
        from: "2026-03-01",
        to: "2026-03-31",
        search: "test",
        limit: 10,
        offset: 0,
      },
      { signal: controller.signal },
    );
    controller.abort();
    await assert.rejects(
      pendingRequest,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    );
  } finally {
    restoreFetch();
  }
});
