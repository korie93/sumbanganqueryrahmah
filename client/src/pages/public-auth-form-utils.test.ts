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
      newPassword: "secret-1a",
      confirmPassword: "secret-2a",
    }),
    {
      confirmPassword: "Pengesahan kata laluan tidak sepadan.",
    },
  );

  assert.equal(
    hasPublicAuthFieldErrors(
      validatePasswordFields({
        currentPassword: "old-secret",
        newPassword: "new-secret1",
        confirmPassword: "new-secret1",
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
      newPassword: "Password mesti antara 8 hingga 256 aksara dan mengandungi huruf serta nombor.",
    },
  );

  assert.deepEqual(
    validatePasswordFields({
      newPassword: `${"A".repeat(256)}1`,
      confirmPassword: `${"A".repeat(256)}1`,
    }),
    {
      newPassword: "Password mesti antara 8 hingga 256 aksara dan mengandungi huruf serta nombor.",
    },
  );
});
