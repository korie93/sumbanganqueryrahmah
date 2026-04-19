import assert from "node:assert/strict";
import test from "node:test";
import { sendAutoLogoutHeartbeat } from "@/components/auto-logout-heartbeat-runtime";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

test("sendAutoLogoutHeartbeat avoids post-unmount side effects after the request resolves", async () => {
  const deferred = createDeferred<void>();
  const heartbeatAbortControllerRef = { current: null as AbortController | null };
  const lastHeartbeatSyncAtRef = { current: 0 };
  const mountedRef = { current: true };
  const logoutStartedRef = { current: false };
  const dispatchedEvents: string[] = [];
  const globalScope = globalThis as typeof globalThis & {
    fetch?: typeof fetch;
    window?: Window & typeof globalThis;
  };
  const previousFetch = globalScope.fetch;
  const previousWindow = globalScope.window;

  globalScope.window = {
    dispatchEvent(event: Event) {
      dispatchedEvents.push(event.type);
      return true;
    },
  } as Window & typeof globalThis;

  globalScope.fetch = (async () => {
    await deferred.promise;
    return new Response(null, {
      status: 204,
    });
  }) as typeof fetch;

  try {
    const heartbeatPromise = sendAutoLogoutHeartbeat({
      heartbeatAbortControllerRef,
      lastHeartbeatSyncAtRef,
      mountedRef,
      logoutStartedRef,
    });

    assert.ok(heartbeatAbortControllerRef.current instanceof AbortController);
    mountedRef.current = false;
    deferred.resolve();
    await heartbeatPromise;

    assert.equal(lastHeartbeatSyncAtRef.current, 0);
    assert.deepEqual(dispatchedEvents, []);
    assert.equal(heartbeatAbortControllerRef.current, null);
  } finally {
    globalScope.fetch = previousFetch;
    globalScope.window = previousWindow;
  }
});
