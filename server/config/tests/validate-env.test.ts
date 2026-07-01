import assert from "node:assert/strict";
import test from "node:test";

import {
  getMissingProductionEnvironmentVariables,
  getProductionSessionJwtKeyPairIssue,
  validateProductionConfig,
} from "../validate-env";

const completeProductionEnv = {
  NODE_ENV: "production",
  SESSION_JWT_PRIVATE_KEY: "private-key-present",
  SESSION_JWT_PUBLIC_KEY: "public-key-present",
  BACKUP_ENCRYPTION_KEY: "backup-key-present",
  COLLECTION_PII_ENCRYPTION_KEY: "collection-pii-key-present",
  TWO_FACTOR_ENCRYPTION_KEY: "two-factor-key-present",
} as const;

test("production SESSION_JWT key-pair validation allows both keys", () => {
  assert.equal(getProductionSessionJwtKeyPairIssue(completeProductionEnv), null);
  assert.doesNotThrow(() => validateProductionConfig(completeProductionEnv));
});

test("production SESSION_JWT key-pair validation reports both missing through required-env list", () => {
  const env = {
    ...completeProductionEnv,
    SESSION_JWT_PRIVATE_KEY: "",
    SESSION_JWT_PUBLIC_KEY: "",
  };

  assert.equal(getProductionSessionJwtKeyPairIssue(env), null);
  assert.deepEqual(getMissingProductionEnvironmentVariables(env), [
    "SESSION_JWT_PRIVATE_KEY",
    "SESSION_JWT_PUBLIC_KEY",
  ]);
});

test("production SESSION_JWT key-pair validation fails when only private key is present", () => {
  const env = {
    ...completeProductionEnv,
    SESSION_JWT_PUBLIC_KEY: "",
  };

  assert.equal(
    getProductionSessionJwtKeyPairIssue(env),
    "FATAL: SESSION_JWT_PRIVATE_KEY and SESSION_JWT_PUBLIC_KEY must be configured together in production.",
  );
  assert.throws(
    () => validateProductionConfig(env),
    /SESSION_JWT_PRIVATE_KEY and SESSION_JWT_PUBLIC_KEY must be configured together in production/,
  );
});

test("production SESSION_JWT key-pair validation fails when only public key is present", () => {
  const env = {
    ...completeProductionEnv,
    SESSION_JWT_PRIVATE_KEY: "",
  };

  assert.equal(
    getProductionSessionJwtKeyPairIssue(env),
    "FATAL: SESSION_JWT_PRIVATE_KEY and SESSION_JWT_PUBLIC_KEY must be configured together in production.",
  );
  assert.throws(
    () => validateProductionConfig(env),
    /SESSION_JWT_PRIVATE_KEY and SESSION_JWT_PUBLIC_KEY must be configured together in production/,
  );
});

test("non-production SESSION_JWT key-pair validation keeps existing flexible behavior", () => {
  assert.equal(getProductionSessionJwtKeyPairIssue({
    NODE_ENV: "development",
    SESSION_JWT_PRIVATE_KEY: "private-key-present",
    SESSION_JWT_PUBLIC_KEY: "",
  }), null);
});
