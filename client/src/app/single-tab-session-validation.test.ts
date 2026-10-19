import assert from "node:assert/strict";
import test from "node:test";
import { validateTabSession } from "./single-tab-session-validation";

const user = { id: "backend-account-7", username: "synthetic.user", role: "user", fullName: null, email: null,
  status: "active", mustChangePassword: false, passwordResetBySuperuser: false,
  isBanned: false, twoFactorEnabled: false, twoFactorPendingSetup: false,
  activatedAt: null, passwordChangedAt: null, lastLoginAt: null };
const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { "Content-Type": "application/json" },
});

test("activation revalidates a credentialed no-store backend account without session writes", async () => {
  const caller = new AbortController();
  const result = await validateTabSession(caller.signal, async (url, options) => {
    assert.equal(url, "/api/me");
    assert.equal(options?.credentials, "include");
    assert.equal(options?.cache, "no-store");
    assert.ok(options?.signal instanceof AbortSignal);
    assert.equal(options?.method, undefined);
    return json({ ok: true, user, sessionExpiresAt: "2099-01-01T00:00:00.000Z" });
  });
  assert.equal(result.status, "verified");
  if (result.status === "verified") {
    assert.equal(result.user.id, user.id);
    assert.equal(result.user.sessionExpiresAt, "2099-01-01T00:00:00.000Z");
  }
});

test("auth failures are local results, even when payload asks to broadcast forceLogout", async () => {
  for (const status of [401, 403]) {
    assert.deepEqual(await validateTabSession(new AbortController().signal,
      async () => json({ forceLogout: true, banned: true }, status)), { status: "unauthenticated", banned: true });
  }
});

test("inconsistent banned or inactive success payloads never mount while forced password remains allowed", async () => {
  for (const change of [{ isBanned: true }, { status: "suspended" }, { status: "pending_activation" }, { status: "disabled" }]) {
    assert.deepEqual(await validateTabSession(new AbortController().signal,
      async () => json({ ok: true, user: { ...user, ...change }, sessionExpiresAt: null })),
    { status: "unauthenticated", banned: "isBanned" in change });
  }
  const result = await validateTabSession(new AbortController().signal,
    async () => json({ ok: true, user: { ...user, mustChangePassword: true }, sessionExpiresAt: null }));
  assert.equal(result.status, "verified");
});

test("invalid identities, non-JSON and infrastructure failures stay closed", async () => {
  for (const response of [json({ ok: true, user: { ...user, id: "" } }),
    json({ ok: true, user: { username: "only-a-display-name" } }),
    json({ maintenance: true }, 503), new Response("<html>unexpected</html>")]) {
    assert.deepEqual(await validateTabSession(new AbortController().signal, async () => response),
      { status: "unavailable" });
  }
  assert.deepEqual(await validateTabSession(new AbortController().signal, async () => {
    throw new TypeError("Synthetic offline");
  }), { status: "unavailable" });
});

test("cleanup cancels the request and ignores late identity/auth failures", async () => {
  for (const response of [json({ ok: true, user }), json({ forceLogout: true }, 401)]) {
    const caller = new AbortController();
    const result = await validateTabSession(caller.signal, async (_url, options) => {
      caller.abort();
      assert.equal(options?.signal?.aborted, true);
      return response;
    });
    assert.deepEqual(result, { status: "unavailable" });
  }
  const caller = new AbortController();
  caller.abort();
  await validateTabSession(caller.signal, async () => { assert.fail("Cancelled attempt must not fetch"); });
});
