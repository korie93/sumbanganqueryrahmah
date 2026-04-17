import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { HttpError, badRequest } from "../../http/errors";
import { createErrorHandler } from "../../middleware/error-handler";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";

test("error handler forwards hidden server errors to remote error tracking with request correlation", async () => {
  const capturedErrors: Array<Record<string, unknown>> = [];
  const app = express();

  app.use((_req, res, next) => {
    res.setHeader("x-request-id", "req-server-123");
    next();
  });
  app.get("/hidden-error", () => {
    throw new HttpError(500, "Database credentials leaked here.", {
      code: "INTERNAL_FAILURE",
      expose: false,
    });
  });
  app.use(createErrorHandler({
    remoteErrorTracker: {
      async captureServerError(payload) {
        capturedErrors.push(payload as Record<string, unknown>);
      },
    },
  }));

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/hidden-error`);
    assert.equal(response.status, 500);
    assert.deepEqual(capturedErrors, [
      {
        code: "INTERNAL_FAILURE",
        errorName: "HttpError",
        eventType: "server.http_error",
        message: "Internal server error",
        method: "GET",
        path: "/hidden-error",
        requestId: "req-server-123",
        routePath: "/hidden-error",
        statusCode: 500,
      },
    ]);
  } finally {
    await stopTestServer(server);
  }
});

test("error handler does not forward exposed client-safe errors to remote error tracking", async () => {
  let captureCount = 0;
  const app = express();

  app.get("/bad-request", () => {
    throw badRequest("Missing import payload.", "INVALID_IMPORT");
  });
  app.use(createErrorHandler({
    remoteErrorTracker: {
      async captureServerError() {
        captureCount += 1;
      },
    },
  }));

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/bad-request`);
    assert.equal(response.status, 400);
    assert.equal(captureCount, 0);
  } finally {
    await stopTestServer(server);
  }
});
