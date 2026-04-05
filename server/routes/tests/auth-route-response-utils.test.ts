import assert from "node:assert/strict";
import test from "node:test";
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
