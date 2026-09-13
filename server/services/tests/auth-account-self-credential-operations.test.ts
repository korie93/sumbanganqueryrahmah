import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../../auth/passwords";
import { AuthAccountSelfCredentialOperations } from "../auth-account-self-credential-operations";
import { AuthAccountError } from "../auth-account-types";

type Actor = Parameters<AuthAccountSelfCredentialOperations["changeOwnPassword"]>[0];
type Storage = ConstructorParameters<typeof AuthAccountSelfCredentialOperations>[0]["storage"];
type Update = Parameters<Storage["updateUserAccount"]>[0];
const currentPassword = "Fixture-current-password-123!";
const newPassword = "Fixture-new-password-123!";
let initialHash: string;
test.before(async () => { initialHash = await hashPassword(currentPassword); });

function fixture(beforeWrite?: (user: Actor) => Actor) {
  let user = {
    id: "password-fixture", username: "password.fixture", role: "user", status: "active",
    passwordHash: initialHash, mustChangePassword: true, passwordResetBySuperuser: true,
    failedLoginAttempts: 3, lockedAt: new Date(), lockedReason: "fixture", lockedBySystem: true,
  } as Actor;
  const updates: Update[] = [];
  const events: string[] = [];
  const storage = {
    updateUserAccount: async (params: Update) => {
      updates.push(params);
      events.push("attempt-write");
      if (beforeWrite) user = beforeWrite(user);
      if (params.expectedPasswordHash !== user.passwordHash) return undefined;
      const { userId: _userId, expectedPasswordHash: _guard, ...record } = params;
      Object.assign(user, record);
      events.push("password-committed");
      return { ...user };
    },
    getActiveActivitiesByUsername: async () => { events.push("read-sessions"); return [{ id: "old-session" }]; },
    deactivateUserActivities: async () => { events.push("revoke-sessions"); },
    createAuditLog: async () => { events.push("audit-success"); return {}; },
  } as unknown as Storage;
  return {
    operations: new AuthAccountSelfCredentialOperations({ storage, ensureUniqueIdentity: async () => {}, validateUsername: () => {} }),
    get user() { return { ...user }; }, updates, events,
  };
}

test("self password change carries verified hash CAS and reports only committed credentials", async () => {
  const f = fixture();
  const result = await f.operations.changeOwnPassword(f.user, { currentPassword, newPassword });
  assert.equal(f.updates[0]?.expectedPasswordHash, initialHash);
  assert.equal(await verifyPassword(newPassword, result.user.passwordHash), true);
  assert.equal(result.user.mustChangePassword, false);
  assert.equal(result.user.passwordResetBySuperuser, false);
  assert.equal(result.user.failedLoginAttempts, 0);
  assert.equal(result.user.lockedAt, null);
  assert.deepEqual(result.closedSessionIds, ["old-session"]);
  assert.deepEqual(f.events, ["attempt-write", "password-committed", "read-sessions", "revoke-sessions", "audit-success"]);
});

test("completed concurrent reset cannot be overwritten with stale current-password proof", async () => {
  const resetHash = await hashPassword("Fixture-reset-password-456!");
  const f = fixture((user) => ({ ...user, passwordHash: resetHash }));
  await assert.rejects(f.operations.changeOwnPassword(f.user, { currentPassword, newPassword }), (error: unknown) => {
    assert.ok(error instanceof AuthAccountError);
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "CONFLICT");
    assert.match(error.message, /Sign in again with your current password/i);
    assert.equal(error.message.includes(currentPassword), false);
    assert.equal(error.message.includes(newPassword), false);
    return true;
  });
  assert.equal(f.user.passwordHash, resetHash);
  assert.deepEqual(f.events, ["attempt-write"], "Stale writes must not revoke fresh sessions or audit success.");
});

test("parallel self password changes using the same proof have exactly one success", async () => {
  const f = fixture();
  const actor = f.user;
  const results = await Promise.allSettled([
    f.operations.changeOwnPassword(actor, { currentPassword, newPassword }),
    f.operations.changeOwnPassword(actor, { currentPassword, newPassword: "Fixture-other-password-456!" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof AuthAccountError);
  assert.equal(rejected.reason.code, "CONFLICT");
  assert.equal(f.events.filter((event) => event === "audit-success").length, 1);
  assert.equal(f.events.filter((event) => event === "revoke-sessions").length, 1);
});

test("invalid current password and invalid new policy cannot reach the account write", async () => {
  const f = fixture();
  await assert.rejects(f.operations.changeOwnPassword(f.user, { currentPassword: "incorrect", newPassword }), { code: "INVALID_CURRENT_PASSWORD" });
  await assert.rejects(f.operations.changeOwnPassword(f.user, { currentPassword, newPassword: "Ab12345!" }), { code: "PASSWORD_TOO_SHORT" });
  await assert.rejects(f.operations.changeOwnPassword(f.user, { currentPassword, newPassword: currentPassword }), { code: "INVALID_PASSWORD" });
  assert.deepEqual(f.events, []);
});
