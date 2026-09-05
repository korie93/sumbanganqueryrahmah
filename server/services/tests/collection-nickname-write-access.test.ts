import assert from "node:assert/strict";
import test from "node:test";
import type { AuthenticatedUser } from "../../auth/guards";
import type { CollectionNicknameAuthProfile, CollectionNicknameSession } from "../../storage-postgres";
import { resolveVerifiedCollectionNicknameFromSession } from "../../routes/collection-access";
import { CollectionNicknameService } from "../collection/collection-nickname.service";
import type { CollectionStoragePort } from "../collection/collection-service-support";
import {
  assertCollectionStaffNicknameWriteAccess,
  requireCollectionStaffNicknameCreateAccess,
} from "../collection/collection-record-write-shared";

function harness(role: "admin" | "user" | "superuser" = "user") {
  const user: AuthenticatedUser = { role, username: "account.one", activityId: "activity-one" };
  const profile: CollectionNicknameAuthProfile = {
    id: "nickname-one",
    nickname: "Collector One",
    roleScope: "both",
    isActive: true,
    nicknamePasswordHash: "existing-password-hash",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    passwordUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const session: CollectionNicknameSession = {
    activityId: user.activityId!,
    username: user.username,
    userRole: role,
    nickname: "COLLECTOR ONE",
    verifiedAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
  const storage = {
    getCollectionNicknameSessionByActivity: async () => session,
    getCollectionNicknameAuthProfileByName: async () => profile,
    getCollectionStaffNicknameByName: async () => profile,
    getCollectionAdminGroupVisibleNicknameValuesByLeader: async () => ["Collector One", "Group Member"],
  } as unknown as CollectionStoragePort;
  return { user, profile, session, storage };
}

for (const role of ["admin", "user"] as const) {
  test(`${role} create uses live verified canonical nickname without report/group assignment`, async () => {
    const { user, profile, storage } = harness(role);
    storage.getCollectionAdminGroupVisibleNicknameValuesByLeader = async () => {
      assert.fail("Create must not depend on report groups");
    };
    assert.equal(await requireCollectionStaffNicknameCreateAccess(storage, user, "  collector one  "), profile.nickname);
  });

  test(`${role} cannot forge another nickname even if the nickname is visible in their group`, async () => {
    const { user, storage } = harness(role);
    await assert.rejects(requireCollectionStaffNicknameCreateAccess(storage, user, "Group Member"), {
      statusCode: 403,
      code: "COLLECTION_NICKNAME_SESSION_MISMATCH",
    });
  });
}

const invalidCases: Array<[string, (state: ReturnType<typeof harness>) => void]> = [
  ["missing activity", ({ user }) => { user.activityId = ""; }],
  ["missing session", ({ storage }) => { storage.getCollectionNicknameSessionByActivity = async () => undefined; }],
  ["different activity", ({ session }) => { session.activityId = "other"; }],
  ["different login", ({ session }) => { session.username = "other"; }],
  ["different role", ({ session }) => { session.userRole = "admin"; }],
  ["missing profile", ({ storage }) => { storage.getCollectionNicknameAuthProfileByName = async () => undefined; }],
  ["inactive nickname", ({ profile }) => { profile.isActive = false; }],
  ["role no longer compatible", ({ profile }) => { profile.roleScope = "admin"; }],
  ["password never set", ({ profile }) => { profile.nicknamePasswordHash = null; }],
  ["password change required", ({ profile }) => { profile.mustChangePassword = true; }],
  ["password reset by superuser", ({ profile }) => { profile.passwordResetBySuperuser = true; }],
  ["password changed after verification", ({ profile, session }) => {
    profile.passwordUpdatedAt = new Date("2026-01-03T00:00:00.000Z");
    session.updatedAt = new Date("2026-01-04T00:00:00.000Z");
  }],
  ["invalid verification timestamp", ({ session }) => { session.verifiedAt = new Date("invalid"); }],
  ["inactive login", ({ user }) => { user.status = "disabled"; }],
  ["banned login", ({ user }) => { user.isBanned = true; }],
  ["expired account session", ({ user }) => { user.sessionExpiresAt = "2000-01-01T00:00:00Z"; }],
];
for (const [name, invalidate] of invalidCases) {
  test(`create/session status fail closed for ${name}`, async () => {
    const state = harness();
    invalidate(state);
    assert.equal(await resolveVerifiedCollectionNicknameFromSession(state.storage, state.user), null);
    assert.deepEqual(await new CollectionNicknameService(state.storage).getNicknameSession(state.user), {
      ok: true,
      nickname: null,
    });
    await assert.rejects(requireCollectionStaffNicknameCreateAccess(state.storage, state.user, "Collector One"), {
      statusCode: 403,
      code: "COLLECTION_NICKNAME_SESSION_REQUIRED",
    });
  });
}

test("session endpoint returns only canonical nickname identity without password metadata", async () => {
  const { user, storage } = harness();
  assert.deepEqual(await new CollectionNicknameService(storage).getNicknameSession(user), {
    ok: true,
    nickname: { id: "nickname-one", nickname: "Collector One" },
  });
});

test("superuser can choose any active nickname without a nickname password/session", async () => {
  const { user, profile, storage } = harness("superuser");
  profile.roleScope = "admin";
  profile.mustChangePassword = true;
  profile.nicknamePasswordHash = null;
  storage.getCollectionNicknameSessionByActivity = async () => { assert.fail("Superuser does not need nickname authentication"); };
  assert.equal(await requireCollectionStaffNicknameCreateAccess(storage, user, "collector one"), "Collector One");
  profile.isActive = false;
  await assert.rejects(requireCollectionStaffNicknameCreateAccess(storage, user, "collector one"), { statusCode: 400 });
});

test("manager cannot create even when passed directly to the service guard", async () => {
  const { user, storage } = harness();
  user.role = "manager";
  await assert.rejects(requireCollectionStaffNicknameCreateAccess(storage, user, "Collector One"), { statusCode: 403 });
});

test("user nickname reassignment cannot bypass the create restriction", async () => {
  const { user, storage } = harness();
  await assert.rejects(assertCollectionStaffNicknameWriteAccess(storage, user, "Group Member"), {
    statusCode: 403,
    code: "COLLECTION_NICKNAME_SESSION_MISMATCH",
  });
});

test("admin group editing remains authorized by their existing report group", async () => {
  const { user, storage } = harness("admin");
  storage.getCollectionStaffNicknameByName = async () => ({
    id: "member-one", nickname: "Group Member", isActive: true, roleScope: "user",
    createdBy: "root", createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.equal(await assertCollectionStaffNicknameWriteAccess(storage, user, "Group Member"), "Group Member");
});
