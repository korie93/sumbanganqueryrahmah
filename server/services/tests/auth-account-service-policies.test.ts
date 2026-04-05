import assert from "node:assert/strict";
import test from "node:test";
import { createAuthAccountServicePolicies } from "../auth-account-service-policies";
import { AuthAccountError } from "../auth-account.service";

function createPolicyStorage() {
  const superuser = {
    id: "super-1",
    username: "superuser",
    email: "superuser@example.com",
    role: "superuser",
  };
  const managedUser = {
    id: "user-1",
    username: "managed.user",
    email: "managed.user@example.com",
    role: "user",
  };
  const unmanagedUser = {
    id: "report-1",
    username: "report.manager",
    email: "report.manager@example.com",
    role: "report",
  };

  return {
    getUser: async (userId: string) => {
      if (userId === superuser.id) return superuser;
      if (userId === managedUser.id) return managedUser;
      if (userId === unmanagedUser.id) return unmanagedUser;
      return null;
    },
    getUserByEmail: async (email: string) => {
      if (email === superuser.email) return superuser;
      if (email === managedUser.email) return managedUser;
      return null;
    },
    getUserByUsername: async (username: string) => {
      if (username === superuser.username) return superuser;
      if (username === managedUser.username) return managedUser;
      return null;
    },
  };
}

test("auth account service policies enforce actor and manageable-target checks", async () => {
  const policies = createAuthAccountServicePolicies(createPolicyStorage() as never);

  await assert.rejects(
    () => policies.requireActor(undefined),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 401
      && error.code === "PERMISSION_DENIED",
  );

  await assert.rejects(
    () => policies.requireSuperuser({
      activityId: "activity-1",
      role: "user",
      username: "managed.user",
      userId: "user-1",
    }),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 403
      && error.code === "PERMISSION_DENIED",
  );

  await assert.rejects(
    () => policies.requireManageableTarget("report-1"),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 403
      && error.code === "PERMISSION_DENIED",
  );
});

test("auth account service policies normalize managed email and preserve uniqueness checks", async () => {
  const policies = createAuthAccountServicePolicies(createPolicyStorage() as never);

  assert.equal(
    policies.requireManagedEmail("  Managed.User@example.com  ", "Managed email is required."),
    "managed.user@example.com",
  );

  await assert.rejects(
    () => policies.ensureUniqueIdentity({ username: "superuser" }),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 409
      && error.code === "USERNAME_TAKEN",
  );

  await assert.rejects(
    () => policies.ensureUniqueIdentity({ email: "managed.user@example.com" }),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 409
      && error.code === "INVALID_EMAIL",
  );
});
