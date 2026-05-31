import assert from "node:assert/strict";
import test from "node:test";
import { invokeAutoLogoutCallback } from "./auto-logout-logout-utils";

test("invokeAutoLogoutCallback runs logout callbacks without redirecting on success", async () => {
  let callbackCalls = 0;
  const redirects: string[] = [];

  const result = await invokeAutoLogoutCallback(
    async () => {
      callbackCalls += 1;
    },
    {
      label: "idle_logout",
      redirectToLogin: (path) => redirects.push(path),
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(callbackCalls, 1);
  assert.deepEqual(redirects, []);
});

test("invokeAutoLogoutCallback handles undefined callbacks gracefully", async () => {
  const redirects: string[] = [];

  const result = await invokeAutoLogoutCallback(undefined, {
    label: "client_logout",
    redirectToLogin: (path) => redirects.push(path),
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(redirects, []);
});

test("invokeAutoLogoutCallback catches callback errors and still redirects to login", async () => {
  const redirects: string[] = [];
  const error = new Error("logout failed");

  const result = await invokeAutoLogoutCallback(
    async () => {
      throw error;
    },
    {
      env: { DEV: false },
      label: "idle_logout",
      redirectToLogin: (path) => redirects.push(path),
    },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, error);
  }
  assert.deepEqual(redirects, ["/login"]);
});
