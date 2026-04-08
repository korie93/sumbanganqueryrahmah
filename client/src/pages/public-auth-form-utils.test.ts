import assert from "node:assert/strict";
import test from "node:test";

import {
  hasPublicAuthFieldErrors,
  validateIdentifierField,
  validatePasswordFields,
} from "./public-auth-form-utils";

test("validateIdentifierField requires a username or email value", () => {
  assert.deepEqual(validateIdentifierField(""), {
    identifier: "Sila masukkan username atau emel anda.",
  });
  assert.equal(hasPublicAuthFieldErrors(validateIdentifierField("operator@example.com")), false);
});

test("validatePasswordFields enforces required password fields and confirmation matching", () => {
  assert.deepEqual(
    validatePasswordFields({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      requireCurrentPassword: true,
    }),
    {
      currentPassword: "Sila masukkan kata laluan semasa.",
      newPassword: "Sila masukkan kata laluan baharu.",
      confirmPassword: "Sila sahkan kata laluan baharu.",
    },
  );

  assert.deepEqual(
    validatePasswordFields({
      newPassword: "secret-1",
      confirmPassword: "secret-2",
    }),
    {
      confirmPassword: "Pengesahan kata laluan tidak sepadan.",
    },
  );

  assert.equal(
    hasPublicAuthFieldErrors(
      validatePasswordFields({
        currentPassword: "old-secret",
        newPassword: "new-secret",
        confirmPassword: "new-secret",
        requireCurrentPassword: true,
      }),
    ),
    false,
  );
});
