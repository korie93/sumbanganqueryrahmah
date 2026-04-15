import assert from "node:assert/strict";
import test from "node:test";
import { ollamaEmbed } from "../../ai-ollama";

test("ollamaEmbed passes an abort signal to fetch and clears the timeout when the request settles", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  let receivedSignal: AbortSignal | null = null;
  let clearTimeoutCalls = 0;

  try {
    globalThis.setTimeout = (((
      handler: TimerHandler,
      _timeout?: number,
    ) => {
      return {
        unref() {
          return undefined;
        },
        handler,
      } as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
    globalThis.clearTimeout = (((_handle: ReturnType<typeof setTimeout>) => {
      clearTimeoutCalls += 1;
    }) as typeof clearTimeout);
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      receivedSignal = init?.signal ?? null;
      return {
        ok: true,
        json: async () => ({ embedding: [1, 2, 3] }),
      } as Response;
    }) as typeof fetch;

    const embedding = await ollamaEmbed("nearest branch", { timeoutMs: 25 });
    assert.deepEqual(embedding, [1, 2, 3]);
    assert.ok(receivedSignal);
    assert.equal(clearTimeoutCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("ollamaEmbed aborts the request when the timeout elapses", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  let triggerTimeout: (() => void) | null = null;

  try {
    globalThis.setTimeout = (((
      handler: TimerHandler,
      _timeout?: number,
    ) => {
      triggerTimeout = () => {
        if (typeof handler === "function") {
          handler();
        }
      };
      return {
        unref() {
          return undefined;
        },
      } as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
    globalThis.clearTimeout = (((_handle: ReturnType<typeof setTimeout>) => undefined) as typeof clearTimeout);
    globalThis.fetch = (((_input: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Request aborted", "AbortError"));
        }, { once: true });
      })) as typeof fetch);

    const pending = ollamaEmbed("timeout me", { timeoutMs: 25 });
    const timeoutTrigger = triggerTimeout as (() => void) | null;
    if (timeoutTrigger !== null) {
      timeoutTrigger();
    }
    await assert.rejects(pending, (error: unknown) => {
      return error instanceof DOMException && error.name === "AbortError";
    });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
