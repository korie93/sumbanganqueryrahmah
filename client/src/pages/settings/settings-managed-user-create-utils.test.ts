import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagedUserCreateReadiness,
  findDuplicateManagedUser,
  getManagedUserCreateRoleGuidance,
  normalizeManagedUserCreateDraft,
  validateManagedUserCreateDraft,
  validateManagedUserCreateDraftFields,
} from "@/pages/settings/settings-managed-user-create-utils";

test("normalizeManagedUserCreateDraft trims and lowercases account identifiers", () => {
  assert.deepEqual(
    normalizeManagedUserCreateDraft({
      createEmailInput: "  ADMIN@Example.com ",
      createFullNameInput: "  Alice Example ",
      createRoleInput: "admin",
      createUsernameInput: "  Alice.Admin ",
    }),
    {
      normalizedEmail: "admin@example.com",
      normalizedFullName: "Alice Example",
      normalizedUsername: "alice.admin",
      role: "admin",
    },
  );
});

test("validateManagedUserCreateDraft rejects invalid usernames", () => {
  assert.equal(
    validateManagedUserCreateDraft({
      createEmailInput: "alice@example.com",
      createFullNameInput: "Alice",
      createRoleInput: "user",
      createUsernameInput: "a",
    }),
    "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
  );
});

test("validateManagedUserCreateDraft requires an activation email", () => {
  assert.equal(
    validateManagedUserCreateDraft({
      createEmailInput: "   ",
      createFullNameInput: "Alice",
      createRoleInput: "user",
      createUsernameInput: "alice",
    }),
    "Email is required for account activation.",
  );
});

test("validateManagedUserCreateDraftFields returns inline field errors", () => {
  assert.deepEqual(
    validateManagedUserCreateDraftFields({
      createEmailInput: "   ",
      createFullNameInput: "Alice",
      createRoleInput: "user",
      createUsernameInput: "a",
    }),
    {
      createEmailInput: "Email is required for account activation.",
      createUsernameInput: "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
    },
  );
});

test("getManagedUserCreateRoleGuidance explains elevated admin access", () => {
  assert.deepEqual(getManagedUserCreateRoleGuidance("admin"), {
    description: "Administrative access. Use only for trusted operators who manage settings.",
    label: "Admin access",
    tone: "warning",
  });

  assert.equal(getManagedUserCreateRoleGuidance("manager").label, "Manager access");
  assert.equal(getManagedUserCreateRoleGuidance("user").label, "User access");
});

test("buildManagedUserCreateReadiness marks required create account inputs", () => {
  assert.deepEqual(
    buildManagedUserCreateReadiness({
      createEmailInput: "   ",
      createFullNameInput: "Alice",
      createRoleInput: "manager",
      createUsernameInput: "a",
    }),
    [
      {
        id: "username",
        label: "Username ready",
        ready: false,
      },
      {
        id: "email",
        label: "Activation email ready",
        ready: false,
      },
      {
        id: "role",
        label: "Role selected",
        ready: true,
      },
    ],
  );

  assert.deepEqual(
    buildManagedUserCreateReadiness({
      createEmailInput: "alice@example.com",
      createFullNameInput: "Alice",
      createRoleInput: "manager",
      createUsernameInput: "alice",
    }).map((item) => item.ready),
    [true, true, true],
  );
});

test("findDuplicateManagedUser matches by username or email", () => {
  const duplicate = findDuplicateManagedUser({
    normalizedEmail: "alice@example.com",
    normalizedUsername: "alice",
    users: [
      {
        email: "alice@example.com",
        id: "user-1",
        username: "alice",
      } as never,
    ],
  });

  assert.equal(duplicate?.id, "user-1");
});
