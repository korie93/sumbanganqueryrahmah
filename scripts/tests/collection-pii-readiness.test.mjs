import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveCollectionPiiReadinessConfig } from "../lib/collection-pii-readiness.mjs";

test("resolveCollectionPiiReadinessConfig disables PII readiness checks without an encryption key", () => {
  const config = resolveCollectionPiiReadinessConfig(
    {
      COLLECTION_PII_ENCRYPTION_KEY: "",
      VERIFY_COLLECTION_PII_SENSITIVE_RETIREMENT: "1",
      VERIFY_COLLECTION_PII_FULL_RETIREMENT: "true",
    },
    "artifacts/release-readiness-local",
  );

  assert.equal(config.encryptionConfigured, false);
  assert.equal(config.retiredFieldsConfigured, false);
  assert.equal(
    config.rolloutReadinessArtifactPath,
    path.join("artifacts/release-readiness-local", "collection-pii-rollout-readiness.json"),
  );
  assert.equal(
    config.statusArtifactPath,
    path.join("artifacts/release-readiness-local", "collection-pii-status.json"),
  );
  assert.equal(config.verifySensitiveRetirement, true);
  assert.equal(config.verifyFullRetirement, true);
});

test("resolveCollectionPiiReadinessConfig enables artifact capture when the encryption key is set", () => {
  const config = resolveCollectionPiiReadinessConfig(
    {
      COLLECTION_PII_ENCRYPTION_KEY: "configured-key",
      COLLECTION_PII_RETIRED_FIELDS: "icNumber,customerPhone,accountNumber",
      VERIFY_COLLECTION_PII_SENSITIVE_RETIREMENT: "yes",
      VERIFY_COLLECTION_PII_FULL_RETIREMENT: "off",
    },
    "artifacts/release-readiness-local",
  );

  assert.equal(config.encryptionConfigured, true);
  assert.equal(config.retiredFieldsConfigured, true);
  assert.equal(
    config.rolloutReadinessArtifactPath,
    path.join("artifacts/release-readiness-local", "collection-pii-rollout-readiness.json"),
  );
  assert.equal(config.verifySensitiveRetirement, true);
  assert.equal(config.verifyFullRetirement, false);
});
