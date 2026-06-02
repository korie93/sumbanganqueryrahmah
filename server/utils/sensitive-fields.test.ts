import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoSensitiveFields,
  deepOmitSensitiveFields,
  findSensitiveFields,
} from "./sensitive-fields";

test("assertNoSensitiveFields accepts responses without sensitive keys", () => {
  assert.doesNotThrow(() =>
    assertNoSensitiveFields({
      ok: true,
      user: {
        username: "admin",
        role: "superuser",
      },
    }),
  );
});

test("assertNoSensitiveFields reports nested sensitive response paths", () => {
  assert.throws(
    () =>
      assertNoSensitiveFields({
        data: {
          users: [
            { username: "safe" },
            { username: "leak", passwordHash: "hash" },
          ],
        },
      }),
    /passwordHash.+response\.data\.users\[1\]\.passwordHash/,
  );
});

test("findSensitiveFields handles cyclic objects without recursion leaks", () => {
  const response: Record<string, unknown> = { id: "response-1" };
  response.self = response;
  Object.defineProperty(response, "token_hash", {
    value: "placeholder-token-hash",
    enumerable: true,
  });

  assert.deepEqual(findSensitiveFields(response), [
    {
      field: "token_hash",
      path: "response.token_hash",
    },
  ]);
});

test("deepOmitSensitiveFields removes nested sensitive keys while preserving safe data", () => {
  const sanitized = deepOmitSensitiveFields({
    ok: true,
    password: "raw",
    data: [
      {
        username: "admin",
        api_key: "api-key",
        profile: {
          displayName: "Admin",
          two_factor_secret_encrypted: "encrypted",
        },
      },
    ],
  });

  assert.deepEqual(sanitized, {
    ok: true,
    data: [
      {
        username: "admin",
        profile: {
          displayName: "Admin",
        },
      },
    ],
  });
});
