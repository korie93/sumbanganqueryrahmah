import path from "node:path";

function isTruthyEnvFlag(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function hasNonEmptyValue(value) {
  return String(value || "").trim().length > 0;
}

export function resolveCollectionPiiReadinessConfig(env, artifactsDir) {
  const encryptionConfigured = hasNonEmptyValue(env.COLLECTION_PII_ENCRYPTION_KEY);
  const retiredFieldsConfigured = hasNonEmptyValue(env.COLLECTION_PII_RETIRED_FIELDS);

  return {
    encryptionConfigured,
    rolloutReadinessArtifactPath: path.join(artifactsDir, "collection-pii-rollout-readiness.json"),
    retiredFieldsConfigured,
    statusArtifactPath: path.join(artifactsDir, "collection-pii-status.json"),
    verifyFullRetirement: isTruthyEnvFlag(env.VERIFY_COLLECTION_PII_FULL_RETIREMENT),
    verifySensitiveRetirement: isTruthyEnvFlag(env.VERIFY_COLLECTION_PII_SENSITIVE_RETIREMENT),
  };
}
