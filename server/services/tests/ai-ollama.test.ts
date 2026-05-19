import assert from "node:assert/strict";
import test from "node:test";
import { runtimeConfig } from "../../config/runtime";
import { ollamaChat, ollamaEmbed } from "../../ai-ollama";

test("ollamaEmbed sends embeddings requests with a cancellable signal", async (t) => {
  let requestSignal: AbortSignal | undefined;
  const clearTimeoutMock = t.mock.method(globalThis, "clearTimeout", (() => undefined) as typeof clearTimeout);
  t.mock.method(globalThis, "fetch", (async (_url: string | URL | Request, init?: RequestInit) => {
    requestSignal = init?.signal ?? undefined;
    return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch);

  const embedding = await ollamaEmbed("hello");

  assert.deepEqual(embedding, [0.1, 0.2, 0.3]);
  assert.equal(requestSignal instanceof AbortSignal, true);
  assert.equal(requestSignal?.aborted, false);
  assert.equal(clearTimeoutMock.mock.callCount(), 1);
});

test("ollamaEmbed normalizes hung embedding requests as timeout failures and clears timers", async (t) => {
  let capturedTimeout: (() => void) | undefined;
  let unrefCalled = false;
  const timeoutHandle = {
    unref() {
      unrefCalled = true;
      return this;
    },
  } as unknown as ReturnType<typeof setTimeout>;

  const setTimeoutMock = t.mock.method(
    globalThis,
    "setTimeout",
    (((handler: TimerHandler, delay?: number) => {
      assert.equal(delay, 5);
      capturedTimeout = handler as () => void;
      return timeoutHandle;
    }) as unknown) as typeof setTimeout,
  );
  const clearTimeoutMock = t.mock.method(
    globalThis,
    "clearTimeout",
    (((handle?: ReturnType<typeof setTimeout>) => {
      assert.equal(handle, timeoutHandle);
    }) as unknown) as typeof clearTimeout,
  );
  t.mock.method(globalThis, "fetch", ((_url: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }) as typeof fetch);

  const request = ollamaEmbed("hello", { timeoutMs: 5 });
  assert.equal(setTimeoutMock.mock.callCount(), 1);
  assert.equal(unrefCalled, true);
  assert.equal(typeof capturedTimeout, "function");
  capturedTimeout?.();

  await assert.rejects(request, /Ollama embeddings timed out after 5ms\./);
  assert.equal(clearTimeoutMock.mock.callCount(), 1);
});

test("ollamaEmbed supports caller-owned cancellation", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", ((_url: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }) as typeof fetch);

  const request = ollamaEmbed("hello", {
    signal: controller.signal,
    timeoutMs: 1_000,
  });
  controller.abort();

  await assert.rejects(request, /Ollama embeddings request cancelled\./);
});

test("ollamaEmbed sends the configured Ollama bearer token without exposing it in config output", async (t) => {
  const previousToken = runtimeConfig.ai.authToken;
  runtimeConfig.ai.authToken = "test-ollama-token";
  t.after(() => {
    runtimeConfig.ai.authToken = previousToken;
  });

  let authorizationHeader: string | null = null;
  t.mock.method(globalThis, "fetch", (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    authorizationHeader = headers.get("authorization");
    return new Response(JSON.stringify({ embedding: [0.4] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch);

  await ollamaEmbed("hello");

  assert.equal(authorizationHeader, "Bearer test-ollama-token");
});

test("ollamaChat sanitizes non-ok provider bodies before throwing", async (t) => {
  const providerBody = "internal-provider-secret api-key=abc123 raw stack trace";
  t.mock.method(globalThis, "fetch", (async () => new Response(providerBody, { status: 502 })) as typeof fetch);

  await assert.rejects(
    ollamaChat([{ role: "user", content: "hello" }]),
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.match((error as Error).message, /Ollama chat failed with HTTP 502\./);
      assert.doesNotMatch((error as Error).message, /abc123|raw stack trace|internal-provider-secret/);
      return true;
    },
  );
});
