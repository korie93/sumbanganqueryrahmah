import assert from "node:assert/strict";
import test from "node:test";

import { installGlobalUnhandledRejectionHandler } from "@/lib/global-unhandled-rejection";

type CapturedListener = (event: { reason?: unknown }) => void;

function createUnhandledRejectionTarget() {
  let listener: CapturedListener | null = null;
  const added: string[] = [];
  const removed: string[] = [];

  return {
    target: {
      addEventListener(type: "unhandledrejection", nextListener: CapturedListener) {
        added.push(type);
        listener = nextListener;
      },
      removeEventListener(type: "unhandledrejection", nextListener: CapturedListener) {
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

test("installGlobalUnhandledRejectionHandler logs unhandled errors through client diagnostics in dev", () => {
  const { target, getListener } = createUnhandledRejectionTarget();
  const logged: unknown[][] = [];
  const cleanup = installGlobalUnhandledRejectionHandler({
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
    listener({ reason: error });

    assert.equal(logged.length, 1);
    assert.deepEqual(logged[0], [
      "Unhandled promise rejection",
      error,
      { reasonType: "error", source: "window.unhandledrejection" },
      { DEV: true },
    ]);
  } finally {
    cleanup();
  }
});

test("installGlobalUnhandledRejectionHandler falls back to console errors outside diagnostic mode", () => {
  const { target, getListener } = createUnhandledRejectionTarget();
  const fallbackErrors: unknown[][] = [];
  const cleanup = installGlobalUnhandledRejectionHandler({
    env: { DEV: false, VITE_CLIENT_DEBUG: "0" },
    fallbackConsoleError: (...args: unknown[]) => {
      fallbackErrors.push(args);
    },
    target,
  });

  try {
    const listener = getListener();

    assert.ok(listener);
    listener({ reason: "network timeout" });

    assert.deepEqual(fallbackErrors, [["Unhandled promise rejection", "network timeout"]]);
  } finally {
    cleanup();
  }
});

test("installGlobalUnhandledRejectionHandler replaces older listeners and cleans up idempotently", () => {
  const { target, getAdded, getListener, getRemoved } = createUnhandledRejectionTarget();
  const firstCleanup = installGlobalUnhandledRejectionHandler({
    env: { DEV: true },
    target,
  });
  const firstListener = getListener();
  const secondCleanup = installGlobalUnhandledRejectionHandler({
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
