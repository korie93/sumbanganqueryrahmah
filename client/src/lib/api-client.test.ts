import assert from "node:assert/strict";
import test from "node:test";

import { throwIfResNotOk } from "./api-client";

test("throwIfResNotOk preserves the default 503 error path when maintenance handling throws", async () => {
  const originalWindow = globalThis.window;
  const location = {
    set href(_value: string) {
      throw new Error("navigation blocked");
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location },
  });

  try {
    await assert.rejects(
      () =>
        throwIfResNotOk(new Response(JSON.stringify({
          maintenance: true,
          message: "Scheduled maintenance",
        }), {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": "maintenance-request-1",
          },
        })),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /^503:/);
        assert.match(error.message, /maintenance-request-1/);
        return true;
      },
    );
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
