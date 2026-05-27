import assert from "node:assert/strict";
import test from "node:test";
import { login } from "./auth-session-api";

function withMockFetch(mock: typeof fetch): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
  } as Storage;
}

test("login reports a friendly message when the proxy returns an HTML 502 page", async () => {
  const restoreFetch = withMockFetch((async () => new Response(
    "<html><body><h1>502 Bad Gateway</h1></body></html>",
    {
      status: 502,
      statusText: "Bad Gateway",
      headers: {
        "Content-Type": "text/html",
        "x-request-id": "proxy-502",
      },
    },
  )) as typeof fetch);

  try {
    await assert.rejects(
      () => login("korie", "secret"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Server sedang tidak tersedia. Sila cuba sebentar lagi.");
        assert.equal((error as { status?: number }).status, 502);
        assert.equal((error as { requestId?: string | null }).requestId, "proxy-502");
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});

test("login sends captcha responses only when provided", async () => {
  const requestBodies: Array<Record<string, unknown>> = [];
  const restoreFetch = withMockFetch((async (_url: string | URL | Request, init?: RequestInit) => {
    requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({
      ok: true,
      username: "korie",
      role: "admin",
      activityId: "activity-1",
      mustChangePassword: false,
      status: "active",
      sessionExpiresAt: "2099-01-01T00:00:00.000Z",
      user: null,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch);

  try {
    await login("korie", "secret", "fingerprint-1");
    await login("korie", "secret", "fingerprint-1", { captchaResponse: "  a7x9  " });

    assert.equal(requestBodies[0].captchaResponse, undefined);
    assert.equal(requestBodies[1].captchaResponse, "a7x9");
  } finally {
    restoreFetch();
  }
});

test("login exposes captcha-required payloads on rejected attempts", async () => {
  const restoreFetch = withMockFetch((async () => new Response(JSON.stringify({
    ok: false,
    message: "Pengesahan keselamatan diperlukan.",
    captcha_required: true,
    captcha_challenge: "3 + 4",
  }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": "captcha-request",
    },
  })) as typeof fetch);

  try {
    await assert.rejects(
      () => login("korie", "secret"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { captchaRequired?: boolean }).captchaRequired, true);
        assert.equal((error as { captchaChallenge?: string | null }).captchaChallenge, "3 + 4");
        assert.equal((error as { requestId?: string | null }).requestId, "captcha-request");
        return true;
      },
    );
  } finally {
    restoreFetch();
  }
});

test("login stores maintenance state and routes to maintenance page on 503 payload", async () => {
  const restoreFetch = withMockFetch((async () => new Response(
    JSON.stringify({
      ok: false,
      message: "Maintenance window active.",
      maintenance: true,
      type: "hard",
      startTime: null,
      endTime: null,
    }),
    {
      status: 503,
      statusText: "Service Unavailable",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "maintenance-login",
      },
    },
  )) as typeof fetch);

  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalCustomEvent = globalThis.CustomEvent;
  const storage = createStorageMock();
  const events: Event[] = [];
  const replacedUrls: string[] = [];

  class TestCustomEvent<T = unknown> extends Event {
    detail: T;

    constructor(type: string, init?: CustomEventInit<T>) {
      super(type);
      this.detail = init?.detail as T;
    }
  }

  Object.defineProperty(globalThis, "CustomEvent", {
    configurable: true,
    value: TestCustomEvent,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      dispatchEvent(event: Event) {
        events.push(event);
        return true;
      },
      history: {
        replaceState(_state: unknown, _title: string, url?: string | URL | null) {
          replacedUrls.push(String(url));
        },
      },
      location: {
        pathname: "/login",
        search: "",
      },
    } as unknown as Window & typeof globalThis,
  });

  try {
    await assert.rejects(
      () => login("korie", "secret"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Maintenance window active.");
        assert.equal((error as { status?: number }).status, 503);
        return true;
      },
    );

    assert.equal(replacedUrls[0], "/maintenance");
    assert.equal(events[0]?.type, "maintenance-updated");
    const storedState = JSON.parse(String(storage.getItem("maintenanceState") || "{}")) as {
      maintenance?: unknown;
      type?: unknown;
    };
    assert.equal(storedState.maintenance, true);
    assert.equal(storedState.type, "hard");
  } finally {
    restoreFetch();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: originalCustomEvent,
    });
  }
});
