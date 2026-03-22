import assert from "node:assert/strict";
import test from "node:test";
import {
  isProductionLikeEnvironment,
  isStrictLocalDevelopmentEnvironment,
} from "../../config/runtime-environment";
import { shouldRunFreshLocalUsersBootstrap } from "../../internal/users-bootstrap/seed";

test("fresh local users bootstrap runs only in strict local development with an empty user table", () => {
  assert.equal(
    shouldRunFreshLocalUsersBootstrap({
      shouldSeedConfiguredUsers: false,
      existingUserCount: 0,
      isStrictLocalDevelopment: true,
    }),
    true,
  );

  assert.equal(
    shouldRunFreshLocalUsersBootstrap({
      shouldSeedConfiguredUsers: false,
      existingUserCount: 0,
      isStrictLocalDevelopment: false,
    }),
    false,
  );

  assert.equal(
    shouldRunFreshLocalUsersBootstrap({
      shouldSeedConfiguredUsers: true,
      existingUserCount: 0,
      isStrictLocalDevelopment: true,
    }),
    false,
  );

  assert.equal(
    shouldRunFreshLocalUsersBootstrap({
      shouldSeedConfiguredUsers: false,
      existingUserCount: 1,
      isStrictLocalDevelopment: true,
    }),
    false,
  );
});

test("runtime environment helper distinguishes strict local development from production-like deployment", () => {
  assert.equal(
    isStrictLocalDevelopmentEnvironment({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
    }),
    true,
  );
  assert.equal(
    isProductionLikeEnvironment({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
    }),
    false,
  );

  assert.equal(
    isStrictLocalDevelopmentEnvironment({
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PUBLIC_APP_URL: "http://10.10.10.10:5000",
    }),
    false,
  );
  assert.equal(
    isProductionLikeEnvironment({
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PUBLIC_APP_URL: "http://10.10.10.10:5000",
    }),
    true,
  );
});

