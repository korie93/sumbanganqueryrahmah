import assert from "node:assert/strict";
import test from "node:test";
import {
  findDuplicateManagedUser,
  normalizeManagedUserCreateDraft,
  validateManagedUserCreateDraft,
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
