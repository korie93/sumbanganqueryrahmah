import assert from "node:assert/strict";
import test from "node:test";
import { installGlobalWindowErrorHandler } from "@/lib/global-window-error";

type CapturedListener = (event: { error?: unknown }) => void;

function createWindowErrorTarget() {
  let listener: CapturedListener | null = null;
  let removeCalls = 0;

  return {
    target: {
      addEventListener(_type: "error", nextListener: CapturedListener) {
        listener = nextListener;
      },
      removeEventListener(_type: "error", nextListener: CapturedListener) {
        removeCalls += 1;
        if (listener === nextListener) {
          listener = null;
        }
      },
    },
    getListener: () => listener,
    getRemoveCalls: () => removeCalls,
  };
}

test("global window error handler forwards only real script errors in production", () => {
  const { target, getListener } = createWindowErrorTarget();
  const reported: unknown[] = [];
  const cleanup = installGlobalWindowErrorHandler({
    env: { DEV: false },
    productionReporter: (error) => reported.push(error),
    target,
  });

  try {
    const listener = getListener();
    const error = new Error("render failed");
    assert.ok(listener);

    listener({});
    listener({ error: "resource URL" });
    listener({ error });

    assert.deepEqual(reported, [error]);
  } finally {
    cleanup();
  }
});

test("global window error handler replaces stale listeners and cleans up idempotently", () => {
  const { target, getListener, getRemoveCalls } = createWindowErrorTarget();
  const firstCleanup = installGlobalWindowErrorHandler({ env: { DEV: true }, target });
  const firstListener = getListener();
  const secondCleanup = installGlobalWindowErrorHandler({ env: { DEV: true }, target });

  assert.notEqual(firstListener, getListener());
  assert.equal(getRemoveCalls(), 1);

  firstCleanup();
  assert.equal(getRemoveCalls(), 1);

  secondCleanup();
  secondCleanup();
  assert.equal(getRemoveCalls(), 2);
  assert.equal(getListener(), null);
});
