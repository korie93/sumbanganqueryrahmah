import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { routeHandler } from "../route-observability";
import { errorHandler } from "../../middleware/error-handler";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";

async function assertNoUnhandledRejectionDuring(action: () => Promise<void>) {
  const unhandledRejections: unknown[] = [];
  const listener = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  process.on("unhandledRejection", listener);
  try {
    await action();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off("unhandledRejection", listener);
  }

  assert.deepEqual(unhandledRejections, []);
}

test("routeHandler forwards delayed async rejections to the global error handler", async () => {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("x-request-id", "req-async-route-1");
    next();
  });
  app.get(
    "/api/async-failure",
    routeHandler(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      throw new Error("async boom");
    }),
  );
  app.use(errorHandler);

  const { server, baseUrl } = await startTestServer(app);
  try {
    await assertNoUnhandledRejectionDuring(async () => {
      const response = await fetch(`${baseUrl}/api/async-failure`);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        ok: false,
        message: "Internal server error",
        code: "INTERNAL_ERROR",
        requestId: "req-async-route-1",
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
          requestId: "req-async-route-1",
        },
      });
    });
  } finally {
    await stopTestServer(server);
  }
});
