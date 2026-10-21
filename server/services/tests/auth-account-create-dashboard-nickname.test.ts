import assert from "node:assert/strict";
import test from "node:test";
import { AuthAccountManagedLifecycleOperations } from "../auth-account-managed-lifecycle-operations";
import type { AuthAccountManagedOpsDeps, AuthAccountManagedUser } from "../auth-account-managed-shared";
import { AuthAccountError } from "../auth-account-types";
import type { CreateManagedUserAccountParams } from "../../repositories/auth-user-repository-types";

const nicknameId = "11111111-1111-4111-8111-111111111111";
const actor = { id: "operator-id", username: "synthetic.operator", role: "superuser", status: "active" } as AuthAccountManagedUser;
function fixture(options: { rejectCreate?: boolean; rejectActor?: boolean } = {}) {
  const created: CreateManagedUserAccountParams[] = [];
  const audit: string[] = [];
  const choices: unknown[] = [];
  let emails = 0;
  const storage: Partial<AuthAccountManagedOpsDeps["storage"]> = {
      createManagedUserAccount: async (params: CreateManagedUserAccountParams) => {
        if (options.rejectCreate) throw new Error("Synthetic transactional nickname rejection");
        created.push(params);
        return { ...actor, ...params, id: "new-account", status: "pending_activation" } as AuthAccountManagedUser;
      },
      createAuditLog: async (input) => { audit.push(input.action); return { id: "audit", ...input } as never; },
      getCollectionStaffNicknames: async (input) => {
        choices.push(input);
        return [{ id: nicknameId, nickname: "SYNTHETIC.STAFF", nicknamePasswordHash: "must-not-leak", nicknamePasswordUpdatedAt: new Date() }] as never;
      },
  };
  // Intentionally expose only the methods exercised by this isolated fixture.
  // An accidental call to another dependency fails rather than accessing a DB.
  const deps = {
    storage,
    requireSuperuser: async () => {
      if (options.rejectActor) throw new AuthAccountError(403, "PERMISSION_DENIED", "Synthetic forbidden actor");
      return actor;
    },
    validateUsername: () => {},
    requireManagedEmail: (value: string | null) => { assert.ok(value); return value; },
    ensureUniqueIdentity: async () => {},
    sendActivationEmail: async () => {
      emails++;
      return { delivery: { sent: true, deliveryMode: "smtp", errorCode: null, errorMessage: null,
        expiresAt: new Date(), previewUrl: null, recipientEmail: "account@example.test" } };
    },
  } as unknown as AuthAccountManagedOpsDeps;
  return { service: new AuthAccountManagedLifecycleOperations(deps), created, audit, choices, emails: () => emails };
}
const input = { username: "synthetic.user", email: "account@example.test", role: "user" };

test("managed creation forwards an optional stable nickname ID before activation; skipping creates no mapping request", async () => {
  for (const role of ["user", "admin"]) {
    const f = fixture();
    await f.service.createManagedUser(undefined, { ...input, role, dashboardNicknameId: nicknameId });
    assert.equal(f.created.length, 1);
    assert.equal(f.created[0]?.dashboardNicknameId, nicknameId);
    assert.equal(f.created[0]?.role, role);
    assert.equal(f.created[0]?.status, "pending_activation");
    assert.equal(f.created[0]?.createdBy, actor.username);
    assert.equal(f.emails(), 1);
    assert.deepEqual(f.audit, ["ACCOUNT_CREATED"]);
  }
  for (const optional of [{}, { dashboardNicknameId: null }]) {
    const f = fixture();
    await f.service.createManagedUser(undefined, { ...input, ...optional });
    assert.equal(Object.prototype.hasOwnProperty.call(f.created[0]!, "dashboardNicknameId"), false);
  }
});

test("direct managed creation rejects malformed nickname IDs and unsupported roles before creating or emailing", async () => {
  for (const patch of [
    { dashboardNicknameId: "invalid" }, { dashboardNicknameId: "" },
    { dashboardNicknameId: nicknameId, role: "manager" },
    { dashboardNicknameId: nicknameId, role: "superuser" },
    { dashboardNicknameId: nicknameId, role: "garbage" },
  ]) {
    const f = fixture();
    await assert.rejects(f.service.createManagedUser(undefined, { ...input, ...patch }), (error: unknown) => error instanceof AuthAccountError && error.statusCode === 400);
    assert.deepEqual(f.created, []); assert.deepEqual(f.audit, []); assert.equal(f.emails(), 0);
  }
  const f = fixture({ rejectCreate: true });
  await assert.rejects(f.service.createManagedUser(undefined, { ...input, dashboardNicknameId: nicknameId }), /transactional nickname rejection/);
  assert.deepEqual(f.created, []); assert.deepEqual(f.audit, []); assert.equal(f.emails(), 0);
});

test("Dashboard nickname options are superuser-only, role-scoped and strip password metadata", async () => {
  const f = fixture();
  for (const role of ["user", "admin"]) {
    assert.deepEqual(await f.service.getManagedUserDashboardNicknames(undefined, { role }), { nicknames: [{ id: nicknameId, nickname: "SYNTHETIC.STAFF" }] });
  }
  assert.deepEqual(f.choices, [{ activeOnly: true, allowedRole: "user" }, { activeOnly: true, allowedRole: "admin" }]);
  for (const query of [{}, { role: "manager" }, { role: "superuser" }, { role: ["user", "admin"] }, { role: "user", activeOnly: false }]) {
    await assert.rejects(f.service.getManagedUserDashboardNicknames(undefined, query), (error: unknown) => error instanceof AuthAccountError && error.statusCode === 400);
  }
  assert.equal(f.choices.length, 2);
  const denied = fixture({ rejectActor: true });
  await assert.rejects(denied.service.getManagedUserDashboardNicknames(undefined, { role: "user" }), (error: unknown) => error instanceof AuthAccountError && error.statusCode === 403);
  await assert.rejects(denied.service.createManagedUser(undefined, { ...input, dashboardNicknameId: nicknameId }));
  assert.deepEqual(denied.created, []); assert.deepEqual(denied.choices, []); assert.equal(denied.emails(), 0);
});
