import assert from "node:assert/strict";
import test from "node:test";
import {
  readActivationBody,
  readLoginBody,
  readManagedUserPatchBody,
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
