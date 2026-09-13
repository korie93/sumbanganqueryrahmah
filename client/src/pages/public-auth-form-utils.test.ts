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
      newPassword: "SecretPass1234!",
      confirmPassword: "SecretPass1235!",
    }),
    {
      confirmPassword: "Pengesahan kata laluan tidak sepadan.",
    },
  );

  assert.equal(
    hasPublicAuthFieldErrors(
      validatePasswordFields({
      currentPassword: "old-secret",
        newPassword: "NewSecret12345!",
        confirmPassword: "NewSecret12345!",
        requireCurrentPassword: true,
      }),
    ),
    false,
  );
});

test("validatePasswordFields mirrors the backend password policy", () => {
  assert.deepEqual(
    validatePasswordFields({
      newPassword: "nodigits",
      confirmPassword: "nodigits",
    }),
    {
      newPassword: "Password mesti sekurang-kurangnya 14 aksara.",
    },
  );

  assert.deepEqual(
    validatePasswordFields({
      newPassword: `${"A".repeat(256)}1`,
      confirmPassword: `${"A".repeat(256)}1`,
    }),
    {
      newPassword: "Password tidak boleh melebihi 256 aksara.",
    },
  );
});
