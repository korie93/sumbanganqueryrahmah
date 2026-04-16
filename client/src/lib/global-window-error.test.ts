import assert from "node:assert/strict";
import test from "node:test";
import { installGlobalWindowErrorHandler } from "@/lib/global-window-error";

type CapturedListener = (event: { error?: unknown; message?: unknown }) => void;

function createWindowErrorTarget() {
  let listener: CapturedListener | null = null;
  const added: string[] = [];
  const removed: string[] = [];

  return {
    target: {
      addEventListener(type: "error", nextListener: CapturedListener) {
        added.push(type);
        listener = nextListener;
      },
      removeEventListener(type: "error", nextListener: CapturedListener) {
        removed.push(type);
        if (listener === nextListener) {
          listener = null;
        }
      },
    },
    getAdded: () => added.slice(),
    getListener: () => listener,
    getRemoved: () => removed.slice(),
  };
}

test("installGlobalWindowErrorHandler logs runtime errors through client diagnostics", () => {
  const { target, getListener } = createWindowErrorTarget();
  const logged: unknown[][] = [];
  const cleanup = installGlobalWindowErrorHandler({
    env: { DEV: true },
    logError: ((...args: unknown[]) => {
      logged.push(args);
    }) as typeof import("@/lib/client-logger").logClientError,
    target,
  });

  try {
    const listener = getListener();
    const error = new Error("boom");

    assert.ok(listener);
    listener({ error, message: "boom" });

    assert.equal(logged.length, 1);
    assert.deepEqual(logged[0], [
      "Unhandled window error",
      error,
      { reasonType: "error", source: "window.error" },
      { DEV: true },
    ]);
  } finally {
    cleanup();
  }
});

test("installGlobalWindowErrorHandler replaces older listeners and cleans up idempotently", () => {
  const { target, getAdded, getListener, getRemoved } = createWindowErrorTarget();
  const firstCleanup = installGlobalWindowErrorHandler({
    env: { DEV: true },
    target,
  });
  const firstListener = getListener();
  const secondCleanup = installGlobalWindowErrorHandler({
    env: { DEV: true },
    target,
  });
  const secondListener = getListener();

  assert.equal(getAdded().length, 2);
  assert.equal(getRemoved().length, 1);
  assert.notEqual(firstListener, secondListener);

  firstCleanup();
  assert.equal(getRemoved().length, 1);

  secondCleanup();
  secondCleanup();
  assert.equal(getRemoved().length, 2);
  assert.equal(getListener(), null);
});
