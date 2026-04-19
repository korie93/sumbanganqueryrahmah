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
      newPassword: "Secret123!",
      confirmPassword: "Secret124!",
    }),
    {
      confirmPassword: "Pengesahan kata laluan tidak sepadan.",
    },
  );

  assert.deepEqual(
    validatePasswordFields({
      newPassword: "secret-1",
      confirmPassword: "secret-2",
    }),
    {
      newPassword:
        "Password mesti sekurang-kurangnya 8 aksara dan mengandungi sekurang-kurangnya satu huruf besar, satu huruf kecil, satu nombor, dan satu aksara khas.",
      confirmPassword: "Pengesahan kata laluan tidak sepadan.",
    },
  );

  assert.equal(
    hasPublicAuthFieldErrors(
      validatePasswordFields({
        currentPassword: "old-secret",
        newPassword: "New-secret1!",
        confirmPassword: "New-secret1!",
        requireCurrentPassword: true,
      }),
    ),
    false,
  );
});
