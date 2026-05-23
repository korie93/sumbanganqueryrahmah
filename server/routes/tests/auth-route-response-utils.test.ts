import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../../http/errors";
import { ERROR_CODES } from "../../../shared/error-codes";
import { AuthAccountError } from "../../services/auth-account.service";
import {
  buildAuthRouteErrorPayload,
  buildOkPayload,
  createAuthJsonRoute,
} from "../auth/auth-route-response-utils";
import {
  createJsonTestApp,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

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

test("auth route response utils build stable success and error payloads", () => {
  assert.deepEqual(buildOkPayload({ user: { id: "user-1" } }), {
    ok: true,
    user: { id: "user-1" },
  });
  assert.deepEqual(
    buildAuthRouteErrorPayload({
      code: "PERMISSION_DENIED",
      details: { field: "role" },
      message: "Forbidden",
    }),
    {
      ok: false,
      message: "Forbidden",
      error: {
        code: "PERMISSION_DENIED",
        message: "Forbidden",
        details: { field: "role" },
      },
    },
  );
  assert.deepEqual(
    buildAuthRouteErrorPayload({
      code: "BAD_REQUEST",
      details: {
        field: "password",
        password: "super-secret",
        databaseUrl: "postgresql://sqr:sqr-secret@localhost/sqr",
      },
      message: "Invalid profile",
    }),
    {
      ok: false,
      message: "Invalid profile",
      error: {
        code: "BAD_REQUEST",
        message: "Invalid profile",
        details: {
          field: "password",
          password: "[redacted]",
          databaseUrl: "[redacted]",
        },
      },
    },
  );
});

test("createAuthJsonRoute forwards unknown errors to the global error handler", async () => {
  const app = createJsonTestApp();
  const thrown = new Error("boom");
  let capturedError: unknown = null;

  app.get(
    "/api/test-unknown-auth-error",
    createAuthJsonRoute(async () => {
      throw thrown;
    }),
  );
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    capturedError = error;
    res.status(500).json({
      ok: false,
      message: "Controlled test error",
    });
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    await assertNoUnhandledRejectionDuring(async () => {
      const response = await fetch(`${baseUrl}/api/test-unknown-auth-error`);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        ok: false,
        message: "Controlled test error",
      });
    });
    assert.equal(capturedError, thrown);
  } finally {
    await stopTestServer(server);
  }
});

test("auth route response utils serialize AuthAccountError and HttpError consistently", async () => {
  const app = createJsonTestApp();
  app.get(
    "/api/test-auth-account-error",
    createAuthJsonRoute(async () => {
      throw new AuthAccountError(
        401,
        ERROR_CODES.TWO_FACTOR_CHALLENGE_INVALID,
        "Two-factor login challenge is invalid or expired.",
        { forceRelogin: true },
      );
    }),
  );
  app.get(
    "/api/test-http-error",
    createAuthJsonRoute(async () => {
      throw new HttpError(409, "Conflict", {
        code: "CONFLICT",
        details: { scope: "username" },
      });
    }),
  );

  const { server, baseUrl } = await startTestServer(app);
  try {
    const authAccountResponse = await fetch(`${baseUrl}/api/test-auth-account-error`);
    assert.equal(authAccountResponse.status, 401);
    assert.deepEqual(await authAccountResponse.json(), {
      ok: false,
      message: "Two-factor login challenge is invalid or expired.",
      error: {
        code: ERROR_CODES.TWO_FACTOR_CHALLENGE_INVALID,
        message: "Two-factor login challenge is invalid or expired.",
      },
      forceRelogin: true,
    });

    const httpErrorResponse = await fetch(`${baseUrl}/api/test-http-error`);
    assert.equal(httpErrorResponse.status, 409);
    assert.deepEqual(await httpErrorResponse.json(), {
      ok: false,
      message: "Conflict",
      error: {
        code: "CONFLICT",
        message: "Conflict",
        details: { scope: "username" },
      },
    });
  } finally {
    await stopTestServer(server);
  }
});
