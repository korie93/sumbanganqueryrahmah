import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../../http/errors";
import { routeHandler, wasRouteErrorLogged } from "../../http/route-observability";
import { errorHandler } from "../../middleware/error-handler";
import { logger } from "../../lib/logger";

test("routeHandler logs unexpected route errors once and forwards them to Express", async (t) => {
  const errorLogMock = t.mock.method(logger, "error", () => {});
  const error = new Error("route exploded");
  let forwardedError: unknown = null;

  const handler = routeHandler(async () => {
    throw error;
  });

  handler(
    {
      method: "GET",
      path: "/api/test-route",
      originalUrl: "/api/test-route",
      route: { path: "/api/test-route" },
    } as never,
    {} as never,
    (nextError) => {
      forwardedError = nextError;
    },
  );

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(forwardedError, error);
  assert.equal(wasRouteErrorLogged(error), true);
  assert.equal(errorLogMock.mock.callCount(), 1);
});

test("errorHandler skips duplicate logging when the route layer already logged the error", (t) => {
  const errorLogMock = t.mock.method(logger, "error", () => {});
  const error = new HttpError(500, "Hidden failure", {
    code: "INTERNAL_FAILURE",
    expose: false,
  });

  const handler = routeHandler(async () => {
    throw error;
  });

  handler(
    {
      method: "GET",
      path: "/api/test-route",
      originalUrl: "/api/test-route",
      route: { path: "/api/test-route" },
    } as never,
    {} as never,
    () => undefined,
  );

  const response = {
    headersSent: false,
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };

  errorHandler(
    error,
    {
      method: "GET",
      path: "/api/test-route",
    } as never,
    response as never,
    () => undefined,
  );

  assert.equal(errorLogMock.mock.callCount(), 1);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.payload, {
    ok: false,
    message: "Internal server error",
  });
});
