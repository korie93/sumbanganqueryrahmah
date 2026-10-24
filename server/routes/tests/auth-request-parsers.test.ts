import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../../http/errors";
import {
  readActivationBody,
  readLoginBody,
  readManagedUserPatchBody,
  readManagedUserBody,
  readManagedUserStatusBody,
  readManagedCredentialsBody,
  readOwnCredentialPatchBody,
  readPasswordResetRequestBody,
  readTwoFactorChallengeBody,
} from "../auth/auth-request-parsers";

test("auth request parsers keep public parser defaults and identifier fallback stable", () => {
  assert.deepEqual(readLoginBody({}), {
    username: "",
    password: "",
    fingerprint: null,
    pcName: null,
    browser: null,
  });
  assert.deepEqual(readTwoFactorChallengeBody({}), {
    challengeToken: "",
    code: "",
  });
  assert.deepEqual(
    readActivationBody({
      username: "alpha.user",
      token: "activation-token",
      newPassword: "secret",
      confirmPassword: "secret",
    }),
    {
      username: "alpha.user",
      token: "activation-token",
      newPassword: "secret",
      confirmPassword: "secret",
    },
  );
  assert.deepEqual(
    readPasswordResetRequestBody({ email: "ops@example.com" }),
    { identifier: "ops@example.com" },
  );
});

test("managed nickname IDs preserve the UUID-shaped identifier compatibility boundary", () => {
  // Existing stored IDs need not carry RFC UUID version/variant bits.
  for (const id of ["11111111-1111-1111-1111-111111111111", "ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB"]) {
    assert.equal(readManagedUserBody({ dashboardNicknameId: id }).dashboardNicknameId, id);
  }
  for (const id of ["", "11111111-1111-1111-1111-11111111111Z", "11111111111111111111111111111111"]) {
    assert.throws(() => readManagedUserBody({ dashboardNicknameId: id }), /Invalid uuid/);
  }
});

test("login metadata keeps UTF-16 length limits for astral Unicode", () => {
  assert.equal(readLoginBody({ pcName: "😀".repeat(64) }).pcName, "😀".repeat(64));
  assert.throws(() => readLoginBody({ pcName: "😀".repeat(65) }), /at most 128 character/);
});

test("auth request parsers preserve self-service field detection and admin normalization", () => {
  assert.deepEqual(
    readOwnCredentialPatchBody({
      newUsername: "",
      currentPassword: "current-secret",
    }),
    {
      body: {
        newUsername: "",
        currentPassword: "current-secret",
      },
      hasUsernameField: true,
      hasPasswordField: true,
      newUsername: "",
      currentPassword: "current-secret",
      newPassword: "",
    },
  );
  assert.deepEqual(
    readManagedUserPatchBody({
      username: "next.user",
      fullName: null,
      email: "ops@example.com",
    }),
    {
      username: "next.user",
      fullName: "",
      email: "ops@example.com",
    },
  );
});

test("auth parser optional fields preserve omission, explicit undefined and null normalization", () => {
  const defaultLogin = { username: "", password: "", fingerprint: null, pcName: null, browser: null };
  assert.deepEqual(readLoginBody({ fingerprint: undefined, pcName: undefined, browser: undefined }), defaultLogin);
  assert.deepEqual(readLoginBody({ fingerprint: null, pcName: null, browser: null }), defaultLogin);
  assert.deepEqual(readLoginBody({ fingerprint: " ", pcName: " ", browser: " " }), defaultLogin);
  assert.deepEqual(readPasswordResetRequestBody({}), { identifier: "" });
  assert.deepEqual(readActivationBody({}), { username: undefined, token: "", newPassword: "", confirmPassword: "" });
  assert.deepEqual(readManagedUserBody({}), { username: "", fullName: null, email: null, role: "user" });
  assert.deepEqual(readManagedUserBody({ fullName: undefined, email: undefined }), { username: "", fullName: null, email: null, role: "user" });
  assert.deepEqual(readManagedUserBody({ fullName: null, email: null }), { username: "", fullName: null, email: null, role: "user" });
  assert.deepEqual(readManagedUserStatusBody({}), { status: undefined, isBanned: undefined });
  assert.deepEqual(readManagedCredentialsBody({}), { newPassword: "" });
  assert.deepEqual(readManagedUserPatchBody({}), { username: undefined, fullName: undefined, email: undefined });
  assert.deepEqual(readOwnCredentialPatchBody({}), {
    body: {}, hasUsernameField: false, hasPasswordField: false, newUsername: undefined, currentPassword: "", newPassword: "",
  });
  const explicit = readOwnCredentialPatchBody({ newUsername: undefined, currentPassword: undefined });
  assert.deepEqual(explicit.body, { newUsername: undefined, currentPassword: undefined });
  assert.equal(explicit.hasUsernameField, true);
  assert.equal(explicit.hasPasswordField, true);
  for (const body of [{ newUsername: null }, { currentPassword: null }, { newPassword: null }]) {
    assert.throws(() => readOwnCredentialPatchBody(body));
  }
});

test("invalid optional auth fields retain the public union error code and message", () => {
  const cases: Array<[() => unknown, string]> = [
    [() => readLoginBody({ fingerprint: 123 }), "fingerprint"],
    [() => readActivationBody({ username: null }), "username"],
    [() => readManagedUserBody({ fullName: 123 }), "fullName"],
    [() => readManagedUserPatchBody({ username: null }), "username"],
    [() => readManagedUserStatusBody({ isBanned: "false" }), "isBanned"],
    [() => readOwnCredentialPatchBody({ currentPassword: null }), "currentPassword"],
  ];
  for (const [parse, path] of cases) {
    assert.throws(parse, (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.code, "REQUEST_BODY_INVALID");
      assert.equal(error.message, "Invalid input");
      assert.deepEqual(error.details, [{ code: "invalid_union", message: "Invalid input", path }]);
      return true;
    });
  }
});
